import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { assertUploadAllowed } from '@/lib/security';

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
  const jpegBuffer = await sharp(Buffer.from(bytes))
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const dir = join(process.cwd(), 'uploads', 'apenados');
  await mkdir(dir, { recursive: true });
  const filename = `${id}.jpg`;
  await writeFile(join(dir, filename), jpegBuffer);

  const photoPath = `uploads/apenados/${filename}`;
  await prisma.apenado.update({ where: { id }, data: { photoPath } });

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
    await unlink(join(process.cwd(), apenado.photoPath));
  } catch {}

  await prisma.apenado.update({ where: { id }, data: { photoPath: null } });

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

  const filePath = join(process.cwd(), apenado.photoPath);
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get('download') === '1';
  const safeName = `${apenado.name}${apenado.matricula ? '_' + apenado.matricula : ''}`.replace(/[^a-zA-Z0-9\-_]/g, '_');
  const disposition = download
    ? `attachment; filename="${safeName}.jpg"`
    : `inline; filename="${safeName}.jpg"`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
