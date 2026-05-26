import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { getApenadoPhotoPath } from '@/lib/storage';
import { invalidateFaceCache } from '@/lib/face-cache';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { id } = await params;
    const apenado = await prisma.apenado.findUnique({
      where: { id },
      select: { photoPath: true },
    });
    if (!apenado) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (!apenado.photoPath) return NextResponse.json({ error: 'Sem foto' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const degrees = body.degrees;
    if (degrees !== 90 && degrees !== 180 && degrees !== 270) {
      return NextResponse.json({ error: 'degrees deve ser 90, 180 ou 270' }, { status: 400 });
    }

    const filePath = getApenadoPhotoPath(apenado.photoPath);
    const inputBuffer = await readFile(filePath);

    const [webpBuffer, hashRaw, qualityResult] = await Promise.all([
      sharp(inputBuffer)
        .rotate(degrees)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer(),
      sharp(inputBuffer)
        .rotate(degrees)
        .resize(9, 8, { fit: 'fill', kernel: 'nearest' })
        .grayscale()
        .raw()
        .toBuffer(),
      sharp(inputBuffer)
        .rotate(degrees)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ]);

    let hash = 0n;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        hash = (hash << 1n) | (hashRaw[row * 9 + col] > hashRaw[row * 9 + col + 1] ? 1n : 0n);
      }
    }
    const photoHash = hash.toString(16).padStart(16, '0');

    const { data: lapData, info: lapInfo } = qualityResult;
    const lapN = lapInfo.width * lapInfo.height;
    let lapSum = 0, lapSumSq = 0;
    for (let i = 0; i < lapN; i++) { lapSum += lapData[i]; lapSumSq += lapData[i] * lapData[i]; }
    const lapMean = lapSum / lapN;
    const photoQuality = Math.round((lapSumSq / lapN - lapMean * lapMean) * 100) / 100;

    const photoHashSha = createHash('sha256').update(webpBuffer).digest('hex');

    await writeFile(filePath, webpBuffer);

    await prisma.apenado.update({
      where: { id },
      data: {
        photoHash,
        photoHashSha,
        photoQuality,
        faceDescriptor: null,
      },
    });

    invalidateFaceCache();

    return NextResponse.json({ photoQuality });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
