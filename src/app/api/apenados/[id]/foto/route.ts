import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { assertUploadAllowed } from '@/lib/security';
import { getApenadosDir, getApenadoPhotoPath } from '@/lib/storage';
import { pgvectorAvailable, clearVector } from '@/lib/pgvector';
import { invalidateFaceCache } from '@/lib/face-cache';


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

  const [webpBuffer, hashRaw, qualityResult] = await Promise.all([
    sharp(inputBuffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer(),
    sharp(inputBuffer)
      .resize(9, 8, { fit: 'fill', kernel: 'nearest' })
      .grayscale()
      .raw()
      .toBuffer(),
    sharp(inputBuffer)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);

  // dHash: compare adjacent pixels in each row → 64-bit hash
  let hash = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      hash = (hash << 1n) | (hashRaw[row * 9 + col] > hashRaw[row * 9 + col + 1] ? 1n : 0n);
    }
  }
  const photoHash = hash.toString(16).padStart(16, '0');

  // Laplacian variance → nitidez (maior = mais nítida)
  const { data: lapData, info: lapInfo } = qualityResult;
  const lapN = lapInfo.width * lapInfo.height;
  let lapSum = 0, lapSumSq = 0;
  for (let i = 0; i < lapN; i++) { lapSum += lapData[i]; lapSumSq += lapData[i] * lapData[i]; }
  const lapMean = lapSum / lapN;
  const photoQuality = Math.round((lapSumSq / lapN - lapMean * lapMean) * 100) / 100;

  const dir = getApenadosDir();
  await mkdir(dir, { recursive: true });
  const filename = `${id}.webp`;
  await writeFile(join(dir, filename), webpBuffer);

  const photoHashSha = createHash('sha256').update(webpBuffer).digest('hex');
  const photoPath = `uploads/apenados/${filename}`;
  await prisma.apenado.update({
    where: { id },
    data: { photoPath, photoHash, photoQuality, photoHashSha },
  });

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

  await prisma.apenado.update({
    where: { id },
    data: {
      photoPath: null,
      photoHash: null,
      photoQuality: null,
      photoHashSha: null,
      faceDescriptor: null,
      detScore: null,
    },
  });

  // Limpa o vector do índice HNSW e invalida o cache em memória
  const pvecAvail = await pgvectorAvailable();
  if (pvecAvail) clearVector(id);
  invalidateFaceCache();

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const apenado = await prisma.apenado.findUnique({
    where: { id },
    select: { photoPath: true, photoHashSha: true, name: true, matricula: true },
  });
  if (!apenado?.photoPath) return NextResponse.json({ error: 'Sem foto' }, { status: 404 });

  // ETag-based revalidation: browser always checks but gets 304 when unchanged.
  // After rotation the hash changes → browser receives the updated image immediately.
  const etag = apenado.photoHashSha ? `"${apenado.photoHashSha}"` : null;
  const ifNoneMatch = req.headers.get('if-none-match');
  if (etag && ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        'Cache-Control': 'private, no-cache',
        'ETag': etag,
      },
    });
  }

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

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Disposition': disposition,
    'Cache-Control': 'private, no-cache',
  };
  if (etag) headers['ETag'] = etag;

  return new Response(new Uint8Array(buffer), { headers });
}
