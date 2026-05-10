import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { mkdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import archiver from 'archiver';
import { createWriteStream } from 'fs';

const UPLOAD_ROOT = process.env.UPLOAD_DIR || '/app/uploads';
const BACKUP_DIR = join(UPLOAD_ROOT, 'backups');

// Subpastas de arquivos para incluir no ZIP (exclui /backups para evitar recursão)
const INCLUDE_DIRS = ['relints', 'chat', 'received'];

export async function POST() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  mkdirSync(BACKUP_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `files_${ts}.zip`;
  const filepath = join(BACKUP_DIR, filename);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(filepath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    for (const dir of INCLUDE_DIRS) {
      const dirPath = join(UPLOAD_ROOT, dir);
      if (existsSync(dirPath)) {
        archive.directory(dirPath, dir);
      }
    }

    archive.finalize();
  });

  const stat = statSync(filepath);
  return NextResponse.json({ name: filename, size: stat.size, createdAt: stat.mtime.toISOString() });
}
