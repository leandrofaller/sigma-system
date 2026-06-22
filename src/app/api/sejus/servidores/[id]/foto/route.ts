import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { getApenadoPhotoPath } from '@/lib/storage';
import { dirname } from 'path';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const internalToken = req.headers.get('X-Sigma-Internal-Token');
  const isAuthorizedInternal = internalToken && internalToken === process.env.NEXTAUTH_SECRET;

  // Validação de Sessão
  if (!session && !isAuthorizedInternal) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // Validação de Role se for acesso via sessão (apenas SUPER_ADMIN pode visualizar fotos de servidores)
  if (session && (session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado. Apenas SUPER_ADMIN pode visualizar fotos de servidores.' }, { status: 403 });
  }

  const { id } = await params;
  const servidor = await prisma.sejusServidor.findUnique({
    where: { id },
    select: {
      photoPath: true,
      nome: true,
    },
  });
  
  const finalPhotoPath = servidor?.photoPath;
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
        const prodPhotoUrl = `${PROD_URL}/api/sejus/servidores/${id}/foto`;
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
          throw new Error('Falha ao baixar foto do servidor do servidor de produção');
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
    'Cache-Control': 'private, no-cache',
  };

  return new Response(new Uint8Array(buffer), { headers });
}
