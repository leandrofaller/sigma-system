import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spawn } from 'child_process';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { warmAdvancedFaceCache, awaitAdvancedFaceCache, getAdvancedCacheStatus } from '@/lib/advanced-face-cache';
import { warmVisitanteFaceCache, awaitVisitanteFaceCache } from '@/lib/visitante-face-cache';
import { pgvectorAdvancedAvailable, searchByVectorAdvanced, searchByVectorAdvancedForVisitantes } from '@/lib/pgvector';
import { createAuditLog } from '@/lib/audit';

export const maxDuration = 120;

interface QualityInfo {
  score: number;
  blur_score: number;
  brightness_score: number;
  contrast_score: number;
  pose_score: number;
  is_valid: boolean;
  details: {
    laplacian_variance: number;
    mean_luminance: number;
    std_luminance: number;
    roll_angle: number;
    yaw_ratio: number;
    pitch_ratio: number;
  };
}

interface AdvancedFace {
  index: number;
  det_score: number;
  bbox: number[];
  kps: number[][];
  embedding: number[];
  liveness_score: number;
  quality: QualityInfo;
}

interface AdvancedAnalyzeResult {
  faces: AdvancedFace[];
  imageWidth: number;
  imageHeight: number;
  faiss_enabled: boolean;
  error?: string;
}

// Interfaces do ArcFace original para comparação
interface ArcFaceResult {
  faces: Array<{
    index: number;
    det_score: number;
    bbox: number[];
    embedding: number[];
    liveness_score?: number | null;
  }>;
  error?: string;
}

function runAdvancedAnalyze(imagePath: string): Promise<{ result: AdvancedAnalyzeResult; duration: number }> {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'advanced_face_analyze.py');
    const envPython = process.env.ARCFACE_PYTHON;
    const candidates = envPython ? [envPython, 'python3', 'python', 'py'] : ['python3', 'python', 'py'];
    let idx = 0;
    const errors: string[] = [];
    let currentProc: any = null;
    let isFinished = false;

    let lastStdout = '';
    let lastStderr = '';

    const timeoutVal = parseInt(process.env.FACE_ANALYSIS_TIMEOUT || '90000', 10);
    const timeout = setTimeout(() => {
      if (isFinished) return;
      isFinished = true;
      if (currentProc) {
        try {
          currentProc.kill('SIGKILL');
        } catch {}
      }
      console.error(`[AdvancedAnalyze Timeout] Ultimo stdout: ${lastStdout}\nUltimo stderr: ${lastStderr}`);
      reject(new Error(`Tempo limite de análise facial avançada excedido (Timeout de ${timeoutVal / 1000}s).`));
    }, timeoutVal);

    function tryNext() {
      if (isFinished) return;
      if (idx >= candidates.length) {
        clearTimeout(timeout);
        isFinished = true;
        reject(new Error(`Python não encontrado para o pipeline avançado. Erros: ${errors.join(', ')}`));
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
      const proc = spawn(cmd, ['-u', scriptPath, imagePath], { env });
      currentProc = proc;
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); lastStdout = stdout; });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); lastStderr = stderr; });

      proc.on('close', (code) => {
        if (isFinished) return;
        const trimmed = stdout.trim();
        const duration = Date.now() - startTime;
        if (trimmed) {
          for (const line of trimmed.split('\n').filter(Boolean).reverse()) {
            try {
              const parsed = JSON.parse(line) as AdvancedAnalyzeResult;
              if (parsed.error) {
                clearTimeout(timeout);
                isFinished = true;
                reject(new Error(parsed.error));
                return;
              }
              if (code === 0) {
                clearTimeout(timeout);
                isFinished = true;
                resolve({ result: parsed, duration });
                return;
              }
              break;
            } catch {}
          }
        }
        if (code !== 0) {
          errors.push(`[${cmd}] ${stderr.trim()}`);
          tryNext();
        } else {
          clearTimeout(timeout);
          isFinished = true;
          reject(new Error('Resposta inválida do script avançado.'));
        }
      });

      proc.on('error', () => {
        if (isFinished) return;
        tryNext();
      });
    }

    tryNext();
  });
}

function runArcFaceAnalyze(imagePath: string): Promise<{ result: ArcFaceResult; duration: number }> {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'arcface_analyze.py');
    const envPython = process.env.ARCFACE_PYTHON;
    const candidates = envPython ? [envPython, 'python3', 'python', 'py'] : ['python3', 'python', 'py'];
    let idx = 0;
    const errors: string[] = [];
    let currentProc: any = null;
    let isFinished = false;

    let lastStdout = '';
    let lastStderr = '';

    const timeoutVal = parseInt(process.env.FACE_ANALYSIS_TIMEOUT || '90000', 10);
    const timeout = setTimeout(() => {
      if (isFinished) return;
      isFinished = true;
      if (currentProc) {
        try {
          currentProc.kill('SIGKILL');
        } catch {}
      }
      console.error(`[ArcFaceAnalyze Timeout] Ultimo stdout: ${lastStdout}\nUltimo stderr: ${lastStderr}`);
      reject(new Error(`Tempo limite de análise ArcFace excedido (Timeout de ${timeoutVal / 1000}s).`));
    }, timeoutVal);

    function tryNext() {
      if (isFinished) return;
      if (idx >= candidates.length) {
        clearTimeout(timeout);
        isFinished = true;
        reject(new Error(`Python não encontrado para o ArcFace. Erros: ${errors.join(', ')}`));
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
      const proc = spawn(cmd, ['-u', scriptPath, imagePath], { env });
      currentProc = proc;
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); lastStdout = stdout; });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); lastStderr = stderr; });

      proc.on('close', (code) => {
        if (isFinished) return;
        const trimmed = stdout.trim();
        const duration = Date.now() - startTime;
        if (trimmed) {
          for (const line of trimmed.split('\n').filter(Boolean).reverse()) {
            try {
              const parsed = JSON.parse(line) as ArcFaceResult;
              if (parsed.error) {
                clearTimeout(timeout);
                isFinished = true;
                reject(new Error(parsed.error));
                return;
              }
              if (code === 0) {
                clearTimeout(timeout);
                isFinished = true;
                resolve({ result: parsed, duration });
                return;
              }
              break;
            } catch {}
          }
        }
        errors.push(`[${cmd}] ${stderr.trim()}`);
        tryNext();
      });

      proc.on('error', () => {
        if (isFinished) return;
        tryNext();
      });
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

  const formData = await req.formData();
  const file = formData.get('image') as File | null;
  const topN = Math.min(50, Math.max(1, parseInt((formData.get('topN') as string) || '20', 10)));
  const minSimilarity = parseInt((formData.get('minSimilarity') as string) || '40', 10);
  const compareArcFace = formData.get('compare') === 'true'; // Se true, roda o ArcFace em paralelo
  const targetType = (formData.get('targetType') as string) || 'apenados';

  if (targetType === 'visitantes') {
    warmVisitanteFaceCache();
  } else {
    warmAdvancedFaceCache();
  }

  if (!file) return NextResponse.json({ error: 'Nenhuma imagem enviada' }, { status: 400 });

  const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'jpg';
  const tmpPath = join(tmpdir(), `advanced_face_${randomUUID()}.${ext}`);

  try {
    await writeFile(tmpPath, Buffer.from(await file.arrayBuffer()));

    const minSim01 = Math.max(0.1, Math.min(0.99, minSimilarity / 100));

    const pvecAvail = await pgvectorAdvancedAvailable();
    
    // Executa as análises faciais sequencialmente para evitar picos de CPU/RAM na VPS (evita erros OOM / Gateway Timeout)
    const advAnalysis = await runAdvancedAnalyze(tmpPath);
    const arcAnalysis = compareArcFace ? await runArcFaceAnalyze(tmpPath).catch(() => null) : null;

    const { result: analysis, duration: advDuration } = advAnalysis;

    if (!analysis.faces || analysis.faces.length === 0) {
      // Registra auditoria de busca sem rosto
      await createAuditLog({
        userId: session.user.id,
        action: 'FACE_ADVANCED_SEARCH',
        details: { success: false, error: 'Nenhum rosto detectado', targetType, executionTimeMs: advDuration }
      });
      return NextResponse.json({
        faces: [],
        imageWidth: analysis.imageWidth,
        imageHeight: analysis.imageHeight,
        backend: pvecAvail ? 'pgvector' : 'memory',
        executionTimeMs: advDuration
      });
    }

    // Seleciona o rosto principal
    const face = analysis.faces[0];

    // Regra 6: Alerta e bloqueio de Anti-Spoofing (liveness_score < 0.5 por padrão)
    const livenessThreshold = parseFloat(process.env.FACE_LIVENESS_THRESHOLD || '0.5');
    if (face.liveness_score < livenessThreshold) {
      await createAuditLog({
        userId: session.user.id,
        action: 'FACE_ADVANCED_SEARCH',
        details: { 
          success: false, 
          livenessBlocked: true, 
          livenessScore: face.liveness_score, 
          targetType,
          executionTimeMs: advDuration 
        }
      });
      return NextResponse.json({
        error: 'Falha na validação: Possível tentativa de apresentação artificial da face.',
        livenessBlocked: true,
        liveness_score: face.liveness_score,
        quality: face.quality
      }, { status: 422 });
    }

    // Regra 7: Alerta de Qualidade de Imagem
    if (!face.quality.is_valid) {
      await createAuditLog({
        userId: session.user.id,
        action: 'FACE_ADVANCED_SEARCH',
        details: { 
          success: false, 
          qualityRejected: true, 
          qualityScore: face.quality.score, 
          targetType,
          executionTimeMs: advDuration 
        }
      });
      return NextResponse.json({
        error: 'A imagem possui baixa qualidade. Solicite nova captura.',
        qualityRejected: true,
        quality: face.quality,
        liveness_score: face.liveness_score
      }, { status: 422 });
    }

    let matches: any[] = [];
    const searchStartTime = Date.now();

    if (targetType === 'visitantes') {
      if (pvecAvail) {
        // Busca via pgvector para visitantes
        const hits = await searchByVectorAdvancedForVisitantes(face.embedding, minSim01, topN);
        if (hits.length > 0) {
          const records = await prisma.sipeVisitante.findMany({
            where: { id: { in: hits.map((h) => h.id) } },
            select: {
              id: true,
              nome: true,
              cpf: true,
              parentesco: true,
              photoPath: true,
              vinculos: {
                select: {
                  apenado: {
                    select: {
                      id: true,
                      nome: true,
                    },
                  },
                },
              },
            },
          });
          const metaMap = new Map(records.map((r) => [r.id, r]));
          matches = hits
            .map(({ id, similarity }) => {
              const meta = metaMap.get(id);
              if (!meta) return null;
              return {
                id: meta.id,
                name: meta.nome,
                cpf: meta.cpf,
                parentesco: meta.parentesco,
                photoPath: meta.photoPath,
                vinculos: meta.vinculos,
                targetType: 'visitantes',
                similarity: toPercent(similarity),
              };
            })
            .filter(Boolean);
        }
      } else {
        // Fallback em memória para visitantes
        const cache = await awaitVisitanteFaceCache(25_000);
        const { ids, vecs, count } = cache;
        const queryVec = new Float32Array(face.embedding);
        const hits: Array<{ idx: number; similarity: number }> = [];

        for (let i = 0; i < count; i++) {
          const offset = i * 512;
          let dot = 0;
          for (let j = 0; j < 512; j++) dot += queryVec[j] * vecs[offset + j];
          if (dot >= minSim01) hits.push({ idx: i, similarity: dot });
        }

        hits.sort((a, b) => b.similarity - a.similarity);
        const topHits = hits.slice(0, topN);

        if (topHits.length > 0) {
          const records = await prisma.sipeVisitante.findMany({
            where: { id: { in: topHits.map((h) => ids[h.idx]) } },
            select: {
              id: true,
              nome: true,
              cpf: true,
              parentesco: true,
              photoPath: true,
              vinculos: {
                select: {
                  apenado: {
                    select: {
                      id: true,
                      nome: true,
                    },
                  },
                },
              },
            },
          });
          const metaMap = new Map(records.map((r) => [r.id, r]));
          matches = topHits
            .map(({ idx, similarity }) => {
              const meta = metaMap.get(ids[idx]);
              if (!meta) return null;
              return {
                id: meta.id,
                name: meta.nome,
                cpf: meta.cpf,
                parentesco: meta.parentesco,
                photoPath: meta.photoPath,
                vinculos: meta.vinculos,
                targetType: 'visitantes',
                similarity: toPercent(similarity),
              };
            })
            .filter(Boolean);
        }
      }
    } else {
      // Busca Apenados
      if (pvecAvail) {
        // Busca via pgvector
        const hits = await searchByVectorAdvanced(face.embedding, minSim01, topN);
        if (hits.length > 0) {
          const records = await prisma.apenado.findMany({
            where: { id: { in: hits.map((h) => h.id) } },
            select: { id: true, name: true, matricula: true, unidade: true, faccao: true, photoPath: true }
          });
          const metaMap = new Map(records.map((r) => [r.id, r]));
          matches = hits
            .map(({ id, similarity }) => {
              const meta = metaMap.get(id);
              if (!meta) return null;
              return { ...meta, targetType: 'apenados', similarity: toPercent(similarity) };
            })
            .filter(Boolean);
        }
      } else {
        // Fallback em memória
        const cache = await awaitAdvancedFaceCache(25_000);
        const { ids, vecs, count } = cache;
        const queryVec = new Float32Array(face.embedding);
        const hits: Array<{ idx: number; similarity: number }> = [];

        for (let i = 0; i < count; i++) {
          const offset = i * 512;
          let dot = 0;
          for (let j = 0; j < 512; j++) dot += queryVec[j] * vecs[offset + j];
          if (dot >= minSim01) hits.push({ idx: i, similarity: dot });
        }

        hits.sort((a, b) => b.similarity - a.similarity);
        const topHits = hits.slice(0, topN);

        if (topHits.length > 0) {
          const records = await prisma.apenado.findMany({
            where: { id: { in: topHits.map((h) => ids[h.idx]) } },
            select: { id: true, name: true, matricula: true, unidade: true, faccao: true, photoPath: true }
          });
          const metaMap = new Map(records.map((r) => [r.id, r]));
          matches = topHits
            .map(({ idx, similarity }) => {
              const meta = metaMap.get(ids[idx]);
              if (!meta) return null;
              return { ...meta, targetType: 'apenados', similarity: toPercent(similarity) };
            })
            .filter(Boolean);
        }
      }
    }

    const searchDuration = Date.now() - searchStartTime;
    const totalDuration = advDuration + searchDuration;

    // Constrói objeto comparativo
    let comparison = null;
    if (compareArcFace && arcAnalysis) {
      comparison = {
        durationMs: arcAnalysis.duration,
        facesCount: arcAnalysis.result.faces?.length ?? 0,
        // O ArcFace não tem liveness avançado, retorna liveness simples se existir
        liveness_score: arcAnalysis.result.faces?.[0]?.liveness_score ?? null
      };
    }

    // Registra auditoria com sucesso
    const highestSimilarity = matches[0]?.similarity ?? 0;
    await createAuditLog({
      userId: session.user.id,
      action: 'FACE_ADVANCED_SEARCH',
      details: {
        success: true,
        executionTimeMs: totalDuration,
        highestSimilarity,
        matchesCount: matches.length,
        livenessScore: face.liveness_score,
        qualityScore: face.quality.score,
        targetType
      }
    });

    return NextResponse.json({
      faces: [{
        index: face.index,
        det_score: face.det_score,
        bbox: face.bbox,
        kps: face.kps,
        liveness_score: face.liveness_score,
        quality: face.quality,
        matches
      }],
      imageWidth: analysis.imageWidth,
      imageHeight: analysis.imageHeight,
      backend: pvecAvail ? 'pgvector' : 'memory',
      executionTimeMs: totalDuration,
      arcFaceComparison: comparison
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
