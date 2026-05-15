import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { isPathInside } from '@/lib/security';

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  zip: 'application/zip',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const uploadsBase = resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'));
  const filePath = resolve(join(uploadsBase, ...(await params).path));

  // Prevent path traversal
  if (!isPathInside(uploadsBase, filePath)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  if (!existsSync(filePath)) {
    console.error(`[uploads] File not found: ${filePath} (UPLOAD_DIR=${process.env.UPLOAD_DIR}, cwd=${process.cwd()})`);
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  }

  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const filename = (await params).path[(await params).path.length - 1].replace(/["\r\n]/g, '_');

  const buffer = await readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
