import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  getCloudConfig,
  uploadBackupToCloud,
  markCloudUploaded,
  getCloudIndex,
} from '@/lib/cloud-backup';

const execAsync = promisify(exec);
const BACKUP_DIR = join(process.env.UPLOAD_DIR || '/app/uploads', 'backups');

function listLocalBackups() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  return readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sql') || f.endsWith('.zip'))
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

  const [backups, cloudIndex, cloudConfig] = await Promise.all([
    listLocalBackups(),
    getCloudIndex(),
    getCloudConfig(),
  ]);

  return NextResponse.json({ backups, cloudIndex, cloudProvider: cloudConfig.provider });
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

  const sanitizeShellArg = (s: string) => {
    if (/[^a-zA-Z0-9._\-\/:]/.test(s)) throw new Error(`Componente da DATABASE_URL contém caracteres inválidos: ${s}`);
    return s;
  };

  const pgHost = sanitizeShellArg(url.hostname);
  const pgPort = sanitizeShellArg(url.port || '5432');
  const pgUser = sanitizeShellArg(decodeURIComponent(url.username));
  const pgDb = sanitizeShellArg(url.pathname.slice(1));

  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  const cmd = `pg_dump -h "${pgHost}" -p "${pgPort}" -U "${pgUser}" -d "${pgDb}" -f "${filepath}"`;

  try {
    await execAsync(cmd, { timeout: 120000, env });
    const stat = statSync(filepath);

    // Auto-upload to cloud if configured
    let cloudId: string | null = null;
    let cloudError: string | null = null;
    const cloudConfig = await getCloudConfig();

    if (cloudConfig.provider !== 'none') {
      try {
        cloudId = await uploadBackupToCloud(filepath, filename, cloudConfig);
        await markCloudUploaded(filename, cloudId, cloudConfig.provider);
      } catch (err: any) {
        cloudError = err.message;
      }
    }

    return NextResponse.json({
      name: filename,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      cloudId,
      cloudError,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Backup falhou', detail: err.stderr || err.message },
      { status: 500 }
    );
  }
}
