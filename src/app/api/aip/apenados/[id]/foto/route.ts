import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { getApenadoPhotoPath } from '@/lib/storage';
import { join, dirname } from 'path';
import sharp from 'sharp';
import { assertUploadAllowed } from '@/lib/security';

const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const internalToken = req.headers.get('X-Sigma-Internal-Token');
  const isAuthorizedInternal = internalToken && internalToken === process.env.NEXTAUTH_SECRET;

  if (!session && !isAuthorizedInternal) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { id } = await params;
  const apenado = await prisma.aIPApenado.findUnique({
    where: { id },
    select: {
      customPhotoPath: true,
      photoPath: true,
      sipeApenado: {
        select: { photoPath: true }
      }
    },
  });
  
  const finalPhotoPath = apenado?.customPhotoPath || apenado?.photoPath || apenado?.sipeApenado?.photoPath;
  if (!finalPhotoPath) return NextResponse.json({ error: 'Sem foto' }, { status: 404 });

  const filePath = getApenadoPhotoPath(finalPhotoPath);
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (err) {
    // Se o arquivo não existir localmente no ambiente de desenvolvimento, tenta buscar da produção
    if (process.env.NODE_ENV !== 'production') {
      try {
        const PROD_URL = 'https://rastreio.owlnet.cloud';
        const prodPhotoUrl = `${PROD_URL}/api/aip/apenados/${id}/foto`;
        const res = await fetch(prodPhotoUrl, {
          headers: {
            'X-Sigma-Internal-Token': process.env.NEXTAUTH_SECRET || '',
          },
        });
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          
          // Grava a foto localmente para cachear e habilitar biometria local
          await mkdir(dirname(filePath), { recursive: true });
          await writeFile(filePath, buffer);
        } else {
          throw new Error('Falha ao baixar foto do apenado AIP do servidor de produção');
        }
      } catch (proxyErr) {
        return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }
  }

  const fileExt = filePath.split('.').pop()?.toLowerCase() ?? 'webp';
  const contentType = fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    // Se for foto customizada, evita cacheamento para atualizar instantaneamente na tela ao trocar
    'Cache-Control': apenado?.customPhotoPath 
      ? 'no-store, no-cache, must-revalidate, proxy-revalidate'
      : 'private, no-cache',
  };

  return new Response(new Uint8Array(buffer), { headers });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const apenado = await prisma.aIPApenado.findUnique({ where: { id } });
  if (!apenado) return NextResponse.json({ error: 'Apenado não encontrado' }, { status: 404 });

  // Verificar permissões do usuário
  const user = session.user as any;
  const userDb = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, canEditApenados: true }
  });
  if (!userDb) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const canEdit = userDb.role === 'SUPER_ADMIN' || userDb.role === 'ADMIN' || (userDb.role === 'OPERATOR' && !!userDb.canEditApenados);
  if (!canEdit) {
    return NextResponse.json({ error: 'Apenas administradores ou operadores autorizados podem editar dados' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('foto') as File;
    if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 });

    const uploadError = assertUploadAllowed(file, {
      allowedExtensions: PHOTO_EXTENSIONS,
      allowedMimePrefixes: ['image/'],
    });
    if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const inputBuffer = Buffer.from(bytes);

    // Redimensiona e converte para WebP usando sharp
    const webpBuffer = await sharp(inputBuffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();

    const baseDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const customDir = join(baseDir, 'aip-apenados');
    await mkdir(customDir, { recursive: true });

    const filename = `custom-${id}.webp`;
    const localFilePath = join(customDir, filename);
    await writeFile(localFilePath, webpBuffer);

    const customPhotoPath = `uploads/aip-apenados/${filename}`;

    const updated = await prisma.aIPApenado.update({
      where: { id },
      data: {
        customPhotoPath,
        atualizadoPor: user.id,
      }
    });

    return NextResponse.json({ success: true, apenado: updated });
  } catch (error: any) {
    console.error('[AIP FOTO UPLOAD] Erro:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao salvar foto' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const apenado = await prisma.aIPApenado.findUnique({ where: { id } });
  if (!apenado) return NextResponse.json({ error: 'Apenado não encontrado' }, { status: 404 });

  // Verificar permissões
  const user = session.user as any;
  const userDb = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, canEditApenados: true }
  });
  if (!userDb) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const canEdit = userDb.role === 'SUPER_ADMIN' || userDb.role === 'ADMIN' || (userDb.role === 'OPERATOR' && !!userDb.canEditApenados);
  if (!canEdit) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  try {
    if (apenado.customPhotoPath) {
      const filePath = getApenadoPhotoPath(apenado.customPhotoPath);
      await unlink(filePath).catch(() => {});
    }

    const updated = await prisma.aIPApenado.update({
      where: { id },
      data: {
        customPhotoPath: null,
        atualizadoPor: user.id,
      }
    });

    return NextResponse.json({ success: true, apenado: updated });
  } catch (error: any) {
    console.error('[AIP FOTO DELETE] Erro:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao remover foto' }, { status: 500 });
  }
}
