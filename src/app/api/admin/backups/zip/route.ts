import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { mkdirSync, rmdirSync, statSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/lib/db';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { RelintPDFDocument, DebriefingPDFDocument } from '@/lib/relint-pdf';

const execAsync = promisify(exec);

const UPLOAD_ROOT = process.env.UPLOAD_DIR || '/app/uploads';
const BACKUP_DIR = join(UPLOAD_ROOT, 'backups');
const INCLUDE_DIRS = ['relints', 'chat', 'received', 'debriefings'];

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 100);
}

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
    // ── 1. Query published RELINTs and Debriefings ────────────────────────
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

    // ── 2. Export JSON manifest ───────────────────────────────────────────
    const exportData = {
      exportedAt: new Date().toISOString(),
      relints: { total: relints.length, items: relints },
      debriefings: { total: debriefings.length, items: debriefings },
    };

    const jsonPath = join(BACKUP_DIR, `_dados_${ts}.json`);
    writeFileSync(jsonPath, JSON.stringify(exportData, null, 2), 'utf-8');
    tmpFiles.push(jsonPath);

    // ── 3. Generate PDFs for each RELINT ─────────────────────────────────
    const relintPdfDir = join(BACKUP_DIR, `_relints_${ts}`);
    mkdirSync(relintPdfDir, { recursive: true });

    let relintPdfs = 0;
    for (const r of relints) {
      try {
        const buf = await renderToBuffer(
          React.createElement(RelintPDFDocument, { relint: r as any }) as any
        );
        const pdfName = `${safeFilename(r.number)}.pdf`;
        const pdfPath = join(relintPdfDir, pdfName);
        writeFileSync(pdfPath, buf);
        tmpFiles.push(pdfPath);
        relintPdfs++;
      } catch {
        // skip individual RELINT if PDF fails; others continue
      }
    }

    // ── 4. Generate PDFs for each Debriefing ─────────────────────────────
    const debriefingPdfDir = join(BACKUP_DIR, `_debriefings_${ts}`);
    mkdirSync(debriefingPdfDir, { recursive: true });

    let debriefingPdfs = 0;
    for (const d of debriefings) {
      try {
        const buf = await renderToBuffer(
          React.createElement(DebriefingPDFDocument, { debriefing: d as any }) as any
        );
        const pdfName = `${safeFilename(d.number)}.pdf`;
        const pdfPath = join(debriefingPdfDir, pdfName);
        writeFileSync(pdfPath, buf);
        tmpFiles.push(pdfPath);
        debriefingPdfs++;
      } catch {
        // skip individual debriefing if PDF fails
      }
    }

    // ── 5. Build the ZIP ──────────────────────────────────────────────────
    // Start with the JSON manifest
    await execAsync(`zip "${filepath}" "${jsonPath}"`, { timeout: 30_000 });

    // Add RELINT PDFs
    if (relintPdfs > 0) {
      const relintDirName = `_relints_${ts}`;
      await execAsync(`zip -r "${filepath}" "${relintDirName}"`, {
        cwd: BACKUP_DIR,
        timeout: 120_000,
      });
    }

    // Add Debriefing PDFs
    if (debriefingPdfs > 0) {
      const debriefingDirName = `_debriefings_${ts}`;
      await execAsync(`zip -r "${filepath}" "${debriefingDirName}"`, {
        cwd: BACKUP_DIR,
        timeout: 120_000,
      });
    }

    // Add upload directories (images, attachments, etc.)
    const foundDirs = INCLUDE_DIRS.filter((d) => existsSync(join(UPLOAD_ROOT, d)));
    if (foundDirs.length > 0) {
      const dirs = foundDirs.map((d) => `"${d}"`).join(' ');
      await execAsync(`zip -r "${filepath}" ${dirs}`, {
        cwd: UPLOAD_ROOT,
        timeout: 300_000,
      });
    }

    // ── 6. Cleanup temp files and temp dirs ───────────────────────────────
    for (const f of tmpFiles) {
      try { unlinkSync(f); } catch {}
    }
    try { rmdirSync(relintPdfDir); } catch {}
    try { rmdirSync(debriefingPdfDir); } catch {}

    const stat = statSync(filepath);
    return NextResponse.json({
      name: filename,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      counts: {
        relints: relintPdfs,
        debriefings: debriefingPdfs,
        dirs: foundDirs,
      },
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
