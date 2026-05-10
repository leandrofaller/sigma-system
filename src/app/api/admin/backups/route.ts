import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);
const BACKUP_DIR = join(process.env.UPLOAD_DIR || '/app/uploads', 'backups');

function listBackups() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  return readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const stat = statSync(join(BACKUP_DIR, f));
      return { name: f, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function GET() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(listBackups());
}

export async function POST() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  mkdirSync(BACKUP_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `backup_${ts}.sql`;
  const filepath = join(BACKUP_DIR, filename);

  const rawUrl = process.env.DATABASE_URL!;
  const url = new URL(rawUrl.replace(/^postgres:\/\//, 'postgresql://'));
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  const cmd = `pg_dump -h "${url.hostname}" -p "${url.port || 5432}" -U "${url.username}" -d "${url.pathname.slice(1)}" -f "${filepath}"`;

  try {
    await execAsync(cmd, { timeout: 120000, env });
    const stat = statSync(filepath);
    return NextResponse.json({ name: filename, size: stat.size, createdAt: stat.mtime.toISOString() });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Backup falhou', detail: err.stderr || err.message },
      { status: 500 }
    );
  }
}
