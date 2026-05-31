import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readFile } from 'fs/promises';
import { getApenadoPhotoPath } from '@/lib/storage';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const apenado = await prisma.aIPApenado.findUnique({
    where: { id },
    select: {
      photoPath: true,
      sipeApenado: {
        select: { photoPath: true }
      }
    },
  });
  
  const finalPhotoPath = apenado?.photoPath || apenado?.sipeApenado?.photoPath;
  if (!finalPhotoPath) return NextResponse.json({ error: 'Sem foto' }, { status: 404 });

  const filePath = getApenadoPhotoPath(finalPhotoPath);
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  }

  const fileExt = filePath.split('.').pop()?.toLowerCase() ?? 'webp';
  const contentType = fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'private, no-cache',
  };

  return new Response(new Uint8Array(buffer), { headers });
}
