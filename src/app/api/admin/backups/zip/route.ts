import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { mkdirSync, statSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const UPLOAD_ROOT = process.env.UPLOAD_DIR || '/app/uploads';
const BACKUP_DIR = join(UPLOAD_ROOT, 'backups');
const INCLUDE_DIRS = ['relints', 'chat', 'received', 'debriefings'];

export async function POST() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  mkdirSync(BACKUP_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `files_${ts}.zip`;
  const filepath = join(BACKUP_DIR, filename);

  // Collect subdirectories that actually exist
  const foundDirs = INCLUDE_DIRS.filter((d) => existsSync(join(UPLOAD_ROOT, d)));

  try {
    if (foundDirs.length > 0) {
      // zip -r <output> <dir1> <dir2> ... executed from UPLOAD_ROOT
      const dirs = foundDirs.join(' ');
      await execAsync(`zip -r "${filepath}" ${dirs}`, {
        cwd: UPLOAD_ROOT,
        timeout: 300_000,
      });
    } else {
      // Produce a valid ZIP with an info file when no upload dirs exist yet
      const infoText = [
        'BACKUP DE ARQUIVOS — SIAIP',
        `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
        `Diretório base: ${UPLOAD_ROOT}`,
        '',
        'Nenhuma subpasta de uploads encontrada.',
        `Pastas esperadas: ${INCLUDE_DIRS.join(', ')}`,
      ].join('\n');

      const tmpInfo = join(BACKUP_DIR, `_info_${ts}.txt`);
      const { writeFileSync } = await import('fs');
      writeFileSync(tmpInfo, infoText);
      await execAsync(`zip "${filepath}" "${tmpInfo}"`, { timeout: 30_000 });
      unlinkSync(tmpInfo);
    }

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
      { error: 'Falha ao gerar ZIP', detail: err?.stderr || err?.message || String(err) },
      { status: 500 }
    );
  }
}
