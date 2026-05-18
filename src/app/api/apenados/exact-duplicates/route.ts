import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spawn } from 'child_process';
import { join } from 'path';

interface ScriptOutput {
  groups: string[][];
  totalFiles: number;
  totalGroups: number;
  errors: string[];
  error?: string;
}

function runPython(scriptPath: string, uploadsDir: string): Promise<ScriptOutput> {
  return new Promise((resolve, reject) => {
    // Tenta python, python3 e py (launcher do Windows) em ordem
    const candidates = ['python', 'python3', 'py'];
    let idx = 0;

    function tryNext() {
      if (idx >= candidates.length) {
        reject(new Error('Python não encontrado. Instale o Python 3 e tente novamente.'));
        return;
      }
      const cmd = candidates[idx++];
      const proc = spawn(cmd, [scriptPath, uploadsDir]);
      let stdout = '';

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.on('close', (code: number) => {
        if (code === 0) {
          try { resolve(JSON.parse(stdout)); }
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  if (raw.error) {
    return NextResponse.json({ error: raw.error }, { status: 500 });
  }

  const allIds = raw.groups.flat();
  if (allIds.length === 0) {
    return NextResponse.json({
      groups: [],
      totalFiles: raw.totalFiles,
      totalGroups: 0,
      errors: raw.errors,
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
  });
}
