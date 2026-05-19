import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spawn } from 'child_process';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export const maxDuration = 60;

interface ArcFace {
  index: number;
  det_score: number;
  bbox: number[];
  kps: number[][];
  embedding: number[];
}

interface AnalyzeResult {
  faces: ArcFace[];
  imageWidth: number;
  imageHeight: number;
  error?: string;
}

function runAnalyze(imagePath: string): Promise<AnalyzeResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'arcface_analyze.py');
    const envPython = process.env.ARCFACE_PYTHON;
    const candidates = envPython ? [envPython] : ['python3', 'python', 'py'];
    let idx = 0;
    const errors: string[] = [];

    function tryNext() {
      if (idx >= candidates.length) {
        const detail = errors.length ? ` | ${errors.join(' | ')}` : '';
        reject(new Error(`Python não encontrado. ARCFACE_PYTHON=${envPython ?? '(não definido)'}${detail}`));
        return;
      }
      const cmd = candidates[idx++];
      const env = {
        ...process.env,
        MPLCONFIGDIR: '/tmp/.matplotlib',
        MPLBACKEND: 'Agg',
        HOME: '/tmp',
        ORT_LOGGING_LEVEL: '3',
        PYTHONWARNINGS: 'ignore',
        TQDM_DISABLE: '1',
      };
      const proc = spawn(cmd, ['-u', scriptPath, imagePath], { shell: true, env });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        const trimmed = stdout.trim();
        if (trimmed) {
          const lines = trimmed.split('\n').filter(Boolean).reverse();
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line) as AnalyzeResult;
              if (parsed.error) {
                reject(new Error(parsed.error));
                return;
              }
              if (code === 0) {
                resolve(parsed);
                return;
              }
              break;
            } catch {}
          }
        }
        if (code !== 0) {
          const raw = stderr.trim() || `exit ${code}`;
          const hint = raw.length > 2000 ? '...' + raw.slice(-2000) : raw;
          errors.push(`[${cmd}] ${hint}`);
          tryNext();
        } else {
          reject(new Error(stderr.trim() || 'Resposta inválida do script Python.'));
        }
      });

      proc.on('error', (e) => {
        errors.push(`[${cmd}] spawn: ${e.message}`);
        tryNext();
      });
    }

    tryNext();
  });
}

// Dot product = cosine similarity (vectors are L2-normalized)
function cosineSim(a: number[], b: number[]): number {
  return a.reduce((s, ai, i) => s + ai * b[i], 0);
}

function toPercent(sim: number): number {
  return Math.max(0, Math.min(100, Math.round(sim * 100)));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('image') as File | null;
  const topN = parseInt((formData.get('topN') as string) || '20', 10);
  const minSimilarity = parseInt((formData.get('minSimilarity') as string) || '30', 10);

  if (!file) {
    return NextResponse.json({ error: 'Nenhuma imagem enviada' }, { status: 400 });
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const tmpPath = join(tmpdir(), `arcface_${randomUUID()}.${ext}`);

  try {
    const bytes = await file.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(bytes));

    const analysis = await runAnalyze(tmpPath);

    if (!analysis.faces || analysis.faces.length === 0) {
      return NextResponse.json({
        faces: [],
        imageWidth: analysis.imageWidth,
        imageHeight: analysis.imageHeight,
        indexed: 0,
      });
    }

    const all = await prisma.apenado.findMany({
      where: { faceDescriptor: { not: null }, NOT: { faceDescriptor: 'NONE' } },
      select: {
        id: true,
        name: true,
        matricula: true,
        unidade: true,
        faccao: true,
        photoPath: true,
        faceDescriptor: true,
      },
    });

    const indexed = all.length;
    const minSim01 = minSimilarity / 100;

    const facesWithMatches = analysis.faces.map((face) => {
      const matches = all
        .map((a) => {
          let stored: number[];
          try { stored = JSON.parse(a.faceDescriptor!); } catch { return null; }
          if (stored.length !== 512) return null;
          const sim = cosineSim(face.embedding, stored);
          if (sim < minSim01) return null;
          const { faceDescriptor: _, ...rest } = a;
          return { ...rest, similarity: toPercent(sim) };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, topN);

      return {
        index: face.index,
        det_score: face.det_score,
        bbox: face.bbox,
        kps: face.kps,
        matches,
      };
    });

    return NextResponse.json({
      faces: facesWithMatches,
      imageWidth: analysis.imageWidth,
      imageHeight: analysis.imageHeight,
      indexed,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
