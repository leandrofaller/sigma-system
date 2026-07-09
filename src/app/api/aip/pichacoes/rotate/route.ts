import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import sharp from 'sharp';

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
    const { url, direction } = await req.json();
    if (!url) {
      return NextResponse.json({ error: 'URL da imagem é obrigatória' }, { status: 400 });
    }

    // A URL deve começar com /api/uploads/pichacoes/
    const prefix = '/api/uploads/pichacoes/';
    const cleanUrl = url.split('?')[0]; // remove query params
    if (!cleanUrl.startsWith(prefix)) {
      return NextResponse.json({ error: 'URL de imagem inválida ou externa' }, { status: 400 });
    }

    const filename = cleanUrl.substring(prefix.length);
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Nome de arquivo inválido' }, { status: 400 });
    }

    const filePath = join(uploadsBase(), 'pichacoes', filename);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'Arquivo não encontrado no servidor' }, { status: 404 });
    }

    const imageBuffer = await readFile(filePath);
    
    // Rotaciona 90 graus no sentido horário por padrão (ou especificado por direction)
    const angle = direction === 'ccw' ? -90 : 90;
    
    const rotatedBuffer = await sharp(imageBuffer)
      .rotate(angle)
      .toBuffer();

    await writeFile(filePath, rotatedBuffer);

    return NextResponse.json({ success: true, url: `${cleanUrl}?t=${Date.now()}` });
  } catch (error: any) {
    console.error('[PICHACOES ROTATE] Erro:', error);
    return NextResponse.json({ error: 'Erro ao rotacionar imagem' }, { status: 500 });
  }
}
