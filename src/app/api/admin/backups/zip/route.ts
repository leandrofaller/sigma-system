import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { mkdirSync, statSync, existsSync, createWriteStream, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

// Use createRequire to load the CommonJS archiver without ES module interop issues
const _require = createRequire(import.meta.url);
const archiver = _require('archiver') as typeof import('archiver');

const UPLOAD_ROOT = process.env.UPLOAD_DIR || '/app/uploads';
const BACKUP_DIR = join(UPLOAD_ROOT, 'backups');
// Subdirectories to include (excludes /backups to avoid recursion)
const INCLUDE_DIRS = ['relints', 'chat', 'received', 'debriefings'];

export async function POST() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  mkdirSync(BACKUP_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `files_${ts}.zip`;
  const filepath = join(BACKUP_DIR, filename);

  try {
    // Scan what actually exists under UPLOAD_ROOT
    const foundDirs: string[] = [];
    for (const dir of INCLUDE_DIRS) {
      const dirPath = join(UPLOAD_ROOT, dir);
      if (existsSync(dirPath)) foundDirs.push(dir);
    }

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(filepath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', (err: any) => {
        if (err.code !== 'ENOENT') reject(err);
      });

      archive.pipe(output);

      if (foundDirs.length > 0) {
        for (const dir of foundDirs) {
          archive.directory(join(UPLOAD_ROOT, dir), dir);
        }
      } else {
        // Always produce a valid (non-empty) ZIP
        const uploadInfo = [
          `BACKUP DE ARQUIVOS — SIAIP`,
          `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
          `Diretório base: ${UPLOAD_ROOT}`,
          ``,
          `Nenhuma subpasta de uploads foi encontrada.`,
          `Pastas esperadas: ${INCLUDE_DIRS.join(', ')}`,
        ].join('\n');
        archive.append(uploadInfo, { name: 'INFO.txt' });
      }

      archive.finalize();
    });

    const stat = statSync(filepath);
    return NextResponse.json({
      name: filename,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      dirs: foundDirs,
    });
  } catch (err: any) {
    try { if (existsSync(filepath)) unlinkSync(filepath); } catch {}
    return NextResponse.json(
      { error: 'Falha ao gerar ZIP', detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
