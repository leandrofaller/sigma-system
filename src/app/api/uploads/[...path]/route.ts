import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

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
  { params }: { params: { path: string[] } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const filePath = join(process.cwd(), 'uploads', ...params.path);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  }

  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const buffer = await readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${params.path[params.path.length - 1]}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
