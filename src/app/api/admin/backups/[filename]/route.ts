import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join, basename } from 'path';

const BACKUP_DIR = join(process.env.UPLOAD_DIR || '/app/uploads', 'backups');

export async function GET(
  _: Request,
  { params }: { params: { filename: string } }
) {
  const session = await auth();
  if ((session?.user as any)?.role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const safe = basename(params.filename);
  const filepath = join(BACKUP_DIR, safe);
  if (!existsSync(filepath))
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const data = readFileSync(filepath);
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safe}"`,
    },
  });
}

export async function DELETE(
  _: Request,
  { params }: { params: { filename: string } }
) {
  const session = await auth();
  if ((session?.user as any)?.role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const safe = basename(params.filename);
  const filepath = join(BACKUP_DIR, safe);
  if (!existsSync(filepath))
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  unlinkSync(filepath);
  return NextResponse.json({ ok: true });
}
