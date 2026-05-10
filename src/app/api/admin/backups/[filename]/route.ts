import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join, basename } from 'path';
import {
  getCloudConfig,
  uploadBackupToCloud,
  markCloudUploaded,
  removeFromCloudIndex,
} from '@/lib/cloud-backup';

const BACKUP_DIR = join(process.env.UPLOAD_DIR || '/app/uploads', 'backups');

function isSuperAdmin(session: any) {
  return (session?.user as any)?.role === 'SUPER_ADMIN';
}

export async function GET(_: Request, { params }: { params: { filename: string } }) {
  const session = await auth();
  if (!isSuperAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const safe = basename(params.filename);
  const filepath = join(BACKUP_DIR, safe);
  if (!existsSync(filepath)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const data = readFileSync(filepath);
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safe}"`,
    },
  });
}

// Upload existing backup to cloud
export async function PUT(_: Request, { params }: { params: { filename: string } }) {
  const session = await auth();
  if (!isSuperAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const safe = basename(params.filename);
  const filepath = join(BACKUP_DIR, safe);
  if (!existsSync(filepath)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const cloudConfig = await getCloudConfig();
  if (cloudConfig.provider === 'none') {
    return NextResponse.json({ error: 'Nenhum provedor de nuvem configurado.' }, { status: 400 });
  }

  try {
    const cloudId = await uploadBackupToCloud(filepath, safe, cloudConfig);
    await markCloudUploaded(safe, cloudId, cloudConfig.provider);
    return NextResponse.json({ cloudId, provider: cloudConfig.provider });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { filename: string } }) {
  const session = await auth();
  if (!isSuperAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const safe = basename(params.filename);
  const filepath = join(BACKUP_DIR, safe);
  if (!existsSync(filepath)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  unlinkSync(filepath);
  await removeFromCloudIndex(safe);
  return NextResponse.json({ ok: true });
}
