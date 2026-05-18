import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { readdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import crypto from 'crypto';

interface ScriptOutput {
  groups: string[][];
  totalFiles: number;
  totalGroups: number;
  errors: string[];
  method: 'python' | 'nodejs';
}

// ── Tenta rodar o script Python ──────────────────────────────────────────────
function runPython(scriptPath: string, uploadsDir: string): Promise<ScriptOutput> {
  return new Promise((resolve, reject) => {
    const candidates = ['python', 'python3', 'py'];
    let idx = 0;

    function tryNext() {
      if (idx >= candidates.length) {
        reject(new Error('PYTHON_NOT_FOUND'));
        return;
      }
      const cmd = candidates[idx++];
      // shell:true → cmd.exe no Windows, resolve PATH do sistema
      const proc = spawn(cmd, [scriptPath, uploadsDir], { shell: true });
      let stdout = '';

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.on('close', (code: number) => {
        if (code === 0 && stdout.trim()) {
          try { resolve({ ...JSON.parse(stdout), method: 'python' }); }
          catch { reject(new Error('Resposta inválida do script Python.')); }
        } else {
          tryNext();
        }
      });
      proc.on('error', () => tryNext());
    }

    tryNext();
  });
}

// ── Fallback: SHA-256 em Node.js puro ────────────────────────────────────────
function sha256Stream(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = createReadStream(filepath);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

async function runNodeJS(uploadsDir: string): Promise<ScriptOutput> {
  const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const hashMap = new Map<string, string[]>();
  const errors: string[] = [];
  let total = 0;

  let files: string[];
  try {
    files = await readdir(uploadsDir);
  } catch {
    return { groups: [], totalFiles: 0, totalGroups: 0, errors: [], method: 'nodejs' };
  }

  for (const filename of files.sort()) {
    const ext = extname(filename).toLowerCase();
    if (!EXTENSIONS.has(ext)) continue;
    const apenadoId = basename(filename, ext);
    const filepath = join(uploadsDir, filename);
    try {
      const h = await sha256Stream(filepath);
      const arr = hashMap.get(h) ?? [];
      arr.push(apenadoId);
      hashMap.set(h, arr);
      total++;
    } catch (e: any) {
      errors.push(`${filename}: ${e.message}`);
    }
  }

  const groups = Array.from(hashMap.values()).filter((ids) => ids.length >= 2);
  return { groups, totalFiles: total, totalGroups: groups.length, errors, method: 'nodejs' };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const scriptPath = join(process.cwd(), 'scripts', 'find_exact_duplicates.py');
  const uploadsDir = join(process.cwd(), 'uploads', 'apenados');

  let raw: ScriptOutput;
  try {
    raw = await runPython(scriptPath, uploadsDir);
  } catch (err: any) {
    if (err.message === 'PYTHON_NOT_FOUND') {
      // Python indisponível — usa implementação Node.js (mesma precisão SHA-256)
      raw = await runNodeJS(uploadsDir);
    } else {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  const allIds = raw.groups.flat();
  if (allIds.length === 0) {
    return NextResponse.json({
      groups: [],
      totalFiles: raw.totalFiles,
      totalGroups: 0,
      errors: raw.errors,
      method: raw.method,
    });
  }

  const apenados = await prisma.apenado.findMany({
    where: { id: { in: allIds } },
    select: { id: true, name: true, matricula: true, unidade: true, faccao: true, photoPath: true },
  });

  const map = new Map(apenados.map((a) => [a.id, a]));
  const enrichedGroups = raw.groups
    .map((ids) => ids.map((id) => map.get(id)).filter(Boolean))
    .filter((g) => g.length >= 2);

  return NextResponse.json({
    groups: enrichedGroups,
    totalFiles: raw.totalFiles,
    totalGroups: enrichedGroups.length,
    errors: raw.errors,
    method: raw.method,
  });
}
