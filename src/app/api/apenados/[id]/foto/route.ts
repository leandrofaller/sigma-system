import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { assertUploadAllowed } from '@/lib/security';
import { getApenadosDir, getApenadoPhotoPath } from '@/lib/storage';


const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const apenado = await prisma.apenado.findUnique({ where: { id } });
  if (!apenado) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

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

  const [webpBuffer, hashRaw] = await Promise.all([
    sharp(inputBuffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer(),
    sharp(inputBuffer)
      .resize(9, 8, { fit: 'fill', kernel: 'nearest' })
      .grayscale()
      .raw()
      .toBuffer(),
  ]);

  // dHash: compare adjacent pixels in each row → 64-bit hash
  let hash = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      hash = (hash << 1n) | (hashRaw[row * 9 + col] > hashRaw[row * 9 + col + 1] ? 1n : 0n);
    }
  }
  const photoHash = hash.toString(16).padStart(16, '0');

  const dir = getApenadosDir();
  await mkdir(dir, { recursive: true });
  const filename = `${id}.webp`;
  await writeFile(join(dir, filename), webpBuffer);

  const photoPath = `uploads/apenados/${filename}`;
  await prisma.apenado.update({ where: { id }, data: { photoPath, photoHash } });

  return NextResponse.json({ photoPath });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas administradores podem remover fotos' }, { status: 403 });
  }

  const { id } = await params;
  const apenado = await prisma.apenado.findUnique({ where: { id }, select: { photoPath: true } });
  if (!apenado) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (!apenado.photoPath) return NextResponse.json({ error: 'Sem foto' }, { status: 404 });

  try {
    await unlink(getApenadoPhotoPath(apenado.photoPath));
  } catch {}

  await prisma.apenado.update({ where: { id }, data: { photoPath: null, photoHash: null } });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const apenado = await prisma.apenado.findUnique({
    where: { id },
    select: { photoPath: true, name: true, matricula: true },
  });
  if (!apenado?.photoPath) return NextResponse.json({ error: 'Sem foto' }, { status: 404 });

  const filePath = getApenadoPhotoPath(apenado.photoPath);
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  }

  const fileExt = filePath.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentType = fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

  const download = req.nextUrl.searchParams.get('download') === '1';
  const safeName = `${apenado.name}${apenado.matricula ? '_' + apenado.matricula : ''}`.replace(/[^a-zA-Z0-9\-_]/g, '_');
  const disposition = download
    ? `attachment; filename="${safeName}.${fileExt}"`
    : `inline; filename="${safeName}.${fileExt}"`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
