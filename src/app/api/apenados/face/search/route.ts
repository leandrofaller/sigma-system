import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spawn } from 'child_process';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { warmFaceCache, awaitFaceCache, getCacheStatus } from '@/lib/face-cache';

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
          for (const line of trimmed.split('\n').filter(Boolean).reverse()) {
            try {
              const parsed = JSON.parse(line) as AnalyzeResult;
              if (parsed.error) { reject(new Error(parsed.error)); return; }
              if (code === 0) { resolve(parsed); return; }
              break;
            } catch {}
          }
        }
        if (code !== 0) {
          const raw = stderr.trim() || `exit ${code}`;
          errors.push(`[${cmd}] ${raw.length > 2000 ? '...' + raw.slice(-2000) : raw}`);
          tryNext();
        } else {
          reject(new Error(stderr.trim() || 'Resposta inválida do script Python.'));
        }
      });

      proc.on('error', (e) => { errors.push(`[${cmd}] spawn: ${e.message}`); tryNext(); });
    }

    tryNext();
  });
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

  // Garante que o cache começou a carregar (não bloqueia)
  warmFaceCache();

  const formData = await req.formData();
  const file = formData.get('image') as File | null;
  const topN = parseInt((formData.get('topN') as string) || '20', 10);
  const minSimilarity = parseInt((formData.get('minSimilarity') as string) || '30', 10);

  if (!file) return NextResponse.json({ error: 'Nenhuma imagem enviada' }, { status: 400 });

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const tmpPath = join(tmpdir(), `arcface_${randomUUID()}.${ext}`);

  try {
    await writeFile(tmpPath, Buffer.from(await file.arrayBuffer()));

    // Roda análise Python e aguarda cache em paralelo.
    // Timeout de 55s para garantir que Next.js responde antes do Traefik (60s).
    const [analysis, faceCache] = await Promise.all([
      runAnalyze(tmpPath),
      awaitFaceCache(50_000),
    ]);

    if (!analysis.faces || analysis.faces.length === 0) {
      return NextResponse.json({
        faces: [],
        imageWidth: analysis.imageWidth,
        imageHeight: analysis.imageHeight,
        indexed: faceCache.count,
      });
    }

    const { ids, vecs, count } = faceCache;
    const minSim01 = minSimilarity / 100;

    // Coleta todos os IDs com similaridade acima do mínimo, para cada rosto detectado
    const allMatchIds = new Set<string>();
    const facesWithHits = analysis.faces.map((face) => {
      const queryVec = new Float32Array(face.embedding);
      const hits: Array<{ idx: number; similarity: number }> = [];

      // Loop tight sobre Float32Array — ~1-2s para 120k × 512
      for (let i = 0; i < count; i++) {
        const offset = i * 512;
        let dot = 0;
        for (let j = 0; j < 512; j++) dot += queryVec[j] * vecs[offset + j];
        if (dot >= minSim01) hits.push({ idx: i, similarity: dot });
      }

      hits.sort((a, b) => b.similarity - a.similarity);
      const topHits = hits.slice(0, topN);
      topHits.forEach(h => allMatchIds.add(ids[h.idx]));

      return { face, topHits };
    });

    // Busca metadados apenas dos top-N IDs (query minúscula, não bloqueia)
    const matchedRecords = allMatchIds.size > 0
      ? await prisma.apenado.findMany({
          where: { id: { in: Array.from(allMatchIds) } },
          select: { id: true, name: true, matricula: true, unidade: true, faccao: true, photoPath: true },
        })
      : [];

    const metaMap = new Map(matchedRecords.map(r => [r.id, r]));

    const facesResult = facesWithHits.map(({ face, topHits }) => ({
      index: face.index,
      det_score: face.det_score,
      bbox: face.bbox,
      kps: face.kps,
      matches: topHits
        .map(({ idx, similarity }) => {
          const meta = metaMap.get(ids[idx]);
          if (!meta) return null;
          return { ...meta, similarity: toPercent(similarity) };
        })
        .filter(Boolean),
    }));

    return NextResponse.json({
      faces: facesResult,
      imageWidth: analysis.imageWidth,
      imageHeight: analysis.imageHeight,
      indexed: count,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

// GET — status do cache (debug)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  return NextResponse.json(getCacheStatus());
}
