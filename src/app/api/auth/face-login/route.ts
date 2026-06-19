import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sign } from 'jsonwebtoken';

const FACE_THRESHOLD = 0.40; // distância euclidiana máxima (quanto menor, mais rigoroso)
const FACE_TOKEN_TTL = 60 * 15; // 15 minutos em segundos

// Rate limiting simples em memória (por IP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

/** Distância euclidiana entre dois vetores de 512 dimensões */
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde 1 minuto.' },
      { status: 429 }
    );
  }

  let body: { email?: string; faceDescriptor?: number[]; image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const { email, faceDescriptor, image } = body;

  // Validações básicas
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'E-mail obrigatório.' }, { status: 400 });
  }
  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
    return NextResponse.json(
      { error: 'Descriptor facial inválido.' },
      { status: 400 }
    );
  }

  // Busca usuário com face cadastrada
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      groupId: true,
      isActive: true,
      faceDescriptor: true,
      faceRegisteredAt: true,
    },
  });

  // Falha genérica para não revelar se o e-mail existe
  const FAIL = NextResponse.json(
    { error: 'Reconhecimento facial não autorizado.' },
    { status: 401 }
  );

  if (!user || !user.isActive) return FAIL;
  if (!user.faceDescriptor) return FAIL;

  // Parse do descriptor salvo no banco
  let storedDescriptor: number[];
  try {
    storedDescriptor = JSON.parse(user.faceDescriptor);
  } catch {
    return FAIL;
  }

  if (!Array.isArray(storedDescriptor) || storedDescriptor.length !== 128) {
    return FAIL;
  }

  // Busca threshold dinâmico das configurações
  let currentThreshold = FACE_THRESHOLD;
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'FACE_THRESHOLD' },
    });
    if (config && typeof config.value === 'number') {
      currentThreshold = config.value;
    }
  } catch (err) {
    console.error('[FaceLogin] Erro ao carregar threshold do banco:', err);
  }

  // Calcula distância euclidiana
  const distance = euclideanDistance(faceDescriptor, storedDescriptor);
  const success = distance <= currentThreshold;

  // Obtém user agent do cabeçalho
  const userAgent = req.headers.get('user-agent');

  // Salva a foto se fornecida
  let relativePhotoPath: string | null = null;
  if (image && typeof image === 'string' && image.startsWith('data:image/')) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Image, 'base64');
      const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
      const loginFacesDir = path.join(uploadDir, 'login-faces');
      await fs.mkdir(loginFacesDir, { recursive: true });

      const filename = `login_${user.id}_${Date.now()}.jpg`;
      const filePath = path.join(loginFacesDir, filename);
      await fs.writeFile(filePath, buffer);
      relativePhotoPath = `uploads/login-faces/${filename}`;
    } catch (err) {
      console.error('[FaceLogin] Erro ao salvar foto de login:', err);
    }
  }

  // Registra a tentativa no audit log (sem await para não bloquear)
  prisma.auditLog
    .create({
      data: {
        userId: user.id,
        action: 'FACE_LOGIN_ATTEMPT',
        entity: 'User',
        entityId: user.id,
        details: { 
          distance: distance.toFixed(4), 
          threshold: currentThreshold.toFixed(2),
          success,
          photoPath: relativePhotoPath
        },
        ipAddress: ip,
        userAgent,
      },
    })
    .catch(() => {});

  if (!success) return FAIL;

  // Emite um token temporário de 15 minutos para o NextAuth
  const secret = process.env.NEXTAUTH_SECRET!;
  const faceToken = sign(
    { userId: user.id, type: 'face_login' },
    secret,
    { expiresIn: FACE_TOKEN_TTL }
  );

  return NextResponse.json({ faceToken });
}
