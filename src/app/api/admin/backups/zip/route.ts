import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { mkdirSync, statSync, existsSync, createWriteStream } from 'fs';
import { join } from 'path';

const UPLOAD_ROOT = process.env.UPLOAD_DIR || '/app/uploads';
const BACKUP_DIR = join(UPLOAD_ROOT, 'backups');
const INCLUDE_DIRS = ['relints', 'chat', 'received'];

export async function POST() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  mkdirSync(BACKUP_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `files_${ts}.zip`;
  const filepath = join(BACKUP_DIR, filename);

  try {
    // Dynamic import to avoid webpack bundling issues
    const archiver = (await import('archiver')).default;

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(filepath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', (err) => {
        if (err.code !== 'ENOENT') reject(err);
      });

      archive.pipe(output);

      let addedAny = false;
      for (const dir of INCLUDE_DIRS) {
        const dirPath = join(UPLOAD_ROOT, dir);
        if (existsSync(dirPath)) {
          archive.directory(dirPath, dir);
          addedAny = true;
        }
      }

      if (!addedAny) {
        // Create an empty zip with a readme if no files found
        archive.append('Nenhum arquivo de upload encontrado.', { name: 'README.txt' });
      }

      archive.finalize();
    });

    const stat = statSync(filepath);
    return NextResponse.json({ name: filename, size: stat.size, createdAt: stat.mtime.toISOString() });
  } catch (err: any) {
    // Clean up partial file if it exists
    try {
      if (existsSync(filepath)) {
        const { unlinkSync } = await import('fs');
        unlinkSync(filepath);
      }
    } catch {}

    return NextResponse.json(
      { error: 'Falha ao gerar ZIP', detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
