import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { assertUploadAllowed } from '@/lib/security';

const ALLOWED_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', // fotos
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv' // arquivos
] as const;

function uploadsBase() {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const { id: ordemId } = await params;

  try {
    // 1. Busca a ordem de missão
    const ordem = await prisma.ordemMissao.findUnique({
      where: { id: ordemId },
      include: { participantes: true }
    });

    if (!ordem) {
      return NextResponse.json({ error: 'Ordem de missão não encontrada' }, { status: 404 });
    }

    // 2. Valida se o usuário tem permissão para fazer upload (participante ou admin/criador)
    const isParticipante = ordem.participantes.some(p => p.userId === userId);
    const isCreatorOrAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(role) || ordem.emitidoPorId === userId;
    
    if (!isParticipante && !isCreatorOrAdmin) {
      return NextResponse.json({ error: 'Você não tem permissão para enviar arquivos para esta ordem de missão' }, { status: 403 });
    }

    if (ordem.status !== 'ATIVA') {
      return NextResponse.json({ error: 'Esta ordem de missão já foi finalizada ou cancelada' }, { status: 400 });
    }

    // 3. Processa o upload
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 });
    }

    const uploadError = assertUploadAllowed(file, {
      allowedExtensions: ALLOWED_EXTENSIONS,
    });
    
    if (uploadError) {
      return NextResponse.json({ error: uploadError }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Salva na pasta uploads/ordens-missao
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const filename = `${randomUUID()}.${ext}`;
    const dir = join(uploadsBase(), 'ordens-missao');

    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), buffer);

    const fileUrl = `/api/uploads/ordens-missao/${filename}`;

    return NextResponse.json({
      url: fileUrl,
      originalName: file.name,
      size: file.size,
      mimeType: file.type
    }, { status: 201 });

  } catch (error: any) {
    console.error('[ORDEM MISSAO UPLOAD] Erro:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao processar upload' }, { status: 500 });
  }
}
