import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { assertUploadAllowed } from '@/lib/security';
import sharp from 'sharp';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const;

function uploadsBase() {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 });
    }

    const uploadError = assertUploadAllowed(file, {
      allowedExtensions: IMAGE_EXTENSIONS,
      allowedMimePrefixes: ['image/'],
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError }, { status: 400 });
    }

    // Otimização e conversão de imagem para WebP
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const webpBuffer = await sharp(inputBuffer)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();

    const filename = `${randomUUID()}.webp`;
    const dir = join(uploadsBase(), 'pichacoes');

    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), webpBuffer);

    const imageUrl = `/api/uploads/pichacoes/${filename}`;

    return NextResponse.json({ url: imageUrl }, { status: 201 });
  } catch (error: any) {
    console.error('[PICHACOES UPLOAD] Erro:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao processar upload' }, { status: 500 });
  }
}
