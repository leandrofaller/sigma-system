import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { mkdirSync, statSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/lib/db';

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

  const tmpFiles: string[] = [];

  try {
    // ── 1. Export published RELINTs from the database ─────────────────────
    const [relints, debriefings] = await Promise.all([
      prisma.relint.findMany({
        where: { status: { in: ['PUBLISHED', 'ARCHIVED'] } },
        include: { author: { select: { id: true, name: true } }, group: true },
        orderBy: { date: 'desc' },
      }),
      prisma.debriefing.findMany({
        where: { status: { in: ['PUBLISHED', 'ARCHIVED'] } },
        include: { author: { select: { id: true, name: true } }, group: true },
        orderBy: { date: 'desc' },
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      relints: {
        total: relints.length,
        items: relints,
      },
      debriefings: {
        total: debriefings.length,
        items: debriefings,
      },
    };

    const jsonPath = join(BACKUP_DIR, `_dados_${ts}.json`);
    writeFileSync(jsonPath, JSON.stringify(exportData, null, 2), 'utf-8');
    tmpFiles.push(jsonPath);

    // ── 2. Build the ZIP ──────────────────────────────────────────────────
    // Start with the JSON export (always present)
    await execAsync(`zip "${filepath}" "${jsonPath}"`, { timeout: 30_000 });

    // Add upload directories if they exist
    const foundDirs = INCLUDE_DIRS.filter((d) => existsSync(join(UPLOAD_ROOT, d)));
    if (foundDirs.length > 0) {
      const dirs = foundDirs.map((d) => `"${d}"`).join(' ');
      await execAsync(`zip -r "${filepath}" ${dirs}`, {
        cwd: UPLOAD_ROOT,
        timeout: 300_000,
      });
    }

    // ── 3. Cleanup temp files ─────────────────────────────────────────────
    for (const f of tmpFiles) {
      try { unlinkSync(f); } catch {}
    }

    const stat = statSync(filepath);
    return NextResponse.json({
      name: filename,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      counts: { relints: relints.length, debriefings: debriefings.length, dirs: foundDirs },
    });
  } catch (err: any) {
    for (const f of tmpFiles) { try { unlinkSync(f); } catch {} }
    try { if (existsSync(filepath)) unlinkSync(filepath); } catch {}
    return NextResponse.json(
      { error: 'Falha ao gerar ZIP', detail: err?.stderr || err?.message || String(err) },
      { status: 500 }
    );
  }
}
