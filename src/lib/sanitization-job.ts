import { spawn } from 'child_process';
import { join, dirname, basename } from 'path';
import { existsSync } from 'fs';
import { mkdir, rename } from 'fs/promises';
import { prisma } from './db';
import { getApenadosDir, getApenadoPhotoPath } from './storage';
import { pgvectorAvailable, searchByVector, clearVector } from './pgvector';
import { invalidateFaceCache } from './face-cache';

export interface SanitizationProgress {
  current: number;
  total: number;
  clean: number;
  noFace: number;
  lowQuality: number;
  duplicate: number;
  errors: number;
  startTime: number;
}

interface JobState {
  isRunning: boolean;
  progress: SanitizationProgress;
  error: string;
}

export interface PythonSanitizerResult {
  id: string;
  has_face?: boolean;
  det_score?: number;
  low_det_score?: number;
  face_width?: number;
  face_height?: number;
  blur_score?: number;
  brightness?: number;
  phash?: string;
  dhash?: string;
  error?: string;
  install?: string;
  done?: boolean;
}

// Singleton state
let state: JobState = {
  isRunning: false,
  progress: { current: 0, total: 0, clean: 0, noFace: 0, lowQuality: 0, duplicate: 0, errors: 0, startTime: 0 },
  error: '',
};
let stopFlag = false;

const BATCH_SIZE = 50;

export function getSanitizationState(): JobState {
  return state;
}

export function stopSanitizationJob(): void {
  stopFlag = true;
}

export function startSanitizationJob(): void {
  if (state.isRunning) return;
  state.isRunning = true;
  state.error = '';
  stopFlag = false;

  runLoop().catch((err) => {
    state.error = err?.message ?? 'Erro desconhecido';
    state.isRunning = false;
  });
}

function getHammingDistance(h1: string, h2: string): number {
  if (!h1 || !h2 || h1.length !== h2.length) return 64;
  try {
    let diff = BigInt('0x' + h1) ^ BigInt('0x' + h2);
    let dist = 0;
    while (diff > 0n) {
      diff &= diff - 1n;
      dist++;
    }
    return dist;
  } catch {
    return 64;
  }
}

/** Spawna o script Python para processar um lote de imagens */
function runSanitizerBatch(ids: string[], uploadsDir: string, photoPaths: Record<string, string>): Promise<PythonSanitizerResult[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'image_sanitizer.py');
    const input = JSON.stringify({ ids, uploads_dir: uploadsDir, photo_paths: photoPaths });
    const envPython = process.env.ARCFACE_PYTHON;
    const localVenv = process.platform === 'win32'
      ? join(process.cwd(), 'backend', '.venv', 'Scripts', 'python.exe')
      : join(process.cwd(), 'backend', '.venv', 'bin', 'python');

    const candidates = envPython
      ? [envPython, localVenv, 'python3', 'python', 'py']
      : [localVenv, 'python3', 'python', 'py'];
    let idx = 0;

    function tryNext() {
      if (idx >= candidates.length) {
        reject(new Error('Python não encontrado. Defina ARCFACE_PYTHON no .env'));
        return;
      }
      const cmd = candidates[idx++];
      const env = {
        ...process.env,
        HOME: '/tmp',
        MPLCONFIGDIR: '/tmp/.matplotlib',
        MPLBACKEND: 'Agg',
        ORT_LOGGING_LEVEL: '3',
        PYTHONWARNINGS: 'ignore',
        TQDM_DISABLE: '1',
      };
      
      const proc = spawn(cmd, ['-u', scriptPath], { stdio: ['pipe', 'pipe', 'pipe'], env });

      let buffer = '';
      let stderr = '';
      const results: PythonSanitizerResult[] = [];

      proc.stdin.write(input);
      proc.stdin.end();

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString().replace(/\x00/g, '');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try { results.push(JSON.parse(trimmed)); } catch {}
        }
      });

      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (buffer.trim()) {
          try { results.push(JSON.parse(buffer.trim())); } catch {}
        }
        const firstResult = results[0];
        if (firstResult?.error && firstResult?.install) {
          reject(new Error(firstResult.error));
          return;
        }
        if (code !== 0 && results.length === 0) {
          tryNext();
        } else {
          resolve(results);
        }
      });

      proc.on('error', () => tryNext());
    }

    tryNext();
  });
}

async function runLoop(): Promise<void> {
  const uploadsDir = getApenadosDir();
  const startTime = Date.now();

  // 1. Conta o total de registros a analisar (Apenados com foto que ainda não foram analisados)
  const totalToAnalyze = await prisma.apenado.count({
    where: {
      photoPath: { not: null },
      sanitizations: { none: {} }, // Sem registros na tabela ImageSanitization
    },
  });

  state.progress = {
    current: 0,
    total: totalToAnalyze,
    clean: 0,
    noFace: 0,
    lowQuality: 0,
    duplicate: 0,
    errors: 0,
    startTime,
  };

  const pvecAvail = await pgvectorAvailable();

  while (!stopFlag) {
    // 2. Busca um lote de apenados sem sanitização
    const records = await prisma.apenado.findMany({
      where: {
        photoPath: { not: null },
        sanitizations: { none: {} },
      },
      select: {
        id: true,
        photoPath: true,
        faceDescriptor: true,
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (records.length === 0) break;

    const ids = records.map((r) => r.id);
    const photoPaths: Record<string, string> = {};
    records.forEach((r) => {
      if (r.photoPath) {
        photoPaths[r.id] = getApenadoPhotoPath(r.photoPath);
      }
    });

    // 3. Roda a análise de imagem no script Python
    let results: PythonSanitizerResult[] = [];
    try {
      results = await runSanitizerBatch(ids, uploadsDir, photoPaths);
    } catch (err: any) {
      state.progress.errors += ids.length;
      state.progress.current += ids.length;
      console.error('[Higienização] Erro ao rodar batch Python:', err.message);
      // Cria registros de erros para não travar o loop infinitamente
      const errorUpdates = records.map((r) =>
        prisma.imageSanitization.create({
          data: {
            apenadoId: r.id,
            photoPath: r.photoPath!,
            originalPath: r.photoPath!,
            status: 'ERROR',
            reason: `Erro crítico do script de análise: ${err.message}`,
          },
        })
      );
      await Promise.all(errorUpdates);
      continue;
    }

    const apenadosMap = new Map(records.map((r) => [r.id, r]));

    // 4. Analisar cada resultado e aplicar a lógica de quarentena
    for (const res of results) {
      if (res.done) continue;
      
      const record = apenadosMap.get(res.id);
      if (!record || !record.photoPath) continue;

      try {
        if (res.error) {
          // Salva log de erro de leitura
          await prisma.imageSanitization.create({
            data: {
              apenadoId: res.id,
              photoPath: record.photoPath,
              originalPath: record.photoPath,
              status: 'ERROR',
              reason: res.error,
            },
          });
          state.progress.errors++;
          continue;
        }

        let status: 'CLEAN' | 'NO_FACE' | 'LOW_QUALITY' | 'DUPLICATE' = 'CLEAN';
        let reason = '';
        let score = res.det_score ?? null;
        let duplicateOfId: string | null = null;

        // Regra A: Sem rosto
        if (res.has_face === false) {
          status = 'NO_FACE';
          reason = res.low_det_score ? `Confiança facial muito baixa (${res.low_det_score} < 0.35)` : 'Nenhum rosto humano detectado';
        } 
        // Regra B: Baixa qualidade
        else if (res.has_face === true) {
          const w = res.face_width ?? 0;
          const h = res.face_height ?? 0;
          const blur = res.blur_score ?? 0;
          const brightness = res.brightness ?? 127;

          if (w < 80 || h < 80) {
            status = 'LOW_QUALITY';
            reason = `Rosto muito pequeno (${w}x${h}px - mínimo exigido: 80x80px)`;
          } else if (blur < 15.0) {
            status = 'LOW_QUALITY';
            reason = `Imagem borrada (blur score ${blur} - mínimo exigido: 15.0)`;
          } else if (brightness < 40.0) {
            status = 'LOW_QUALITY';
            reason = `Iluminação muito escura (brilho médio ${brightness} - mínimo: 40.0)`;
          } else if (brightness > 220.0) {
            status = 'LOW_QUALITY';
            reason = `Superexposta / excesso de luz (brilho médio ${brightness} - máximo: 220.0)`;
          }
        }

        // Regra C: Deduplicação
        if (status === 'CLEAN' && res.dhash) {
          // Camada 1: pHash/dHash exato ou Hamming <= 2 no banco
          const duplicateHash = await prisma.imageSanitization.findFirst({
            where: {
              hashPerceptual: { not: null },
              status: 'CLEAN',
              apenadoId: { not: res.id },
            },
            select: { apenadoId: true, hashPerceptual: true },
          });

          // Se achou uma similaridade muito alta por Hamming Distance
          if (duplicateHash && duplicateHash.hashPerceptual && getHammingDistance(res.dhash, duplicateHash.hashPerceptual) <= 2) {
            status = 'DUPLICATE';
            reason = `Duplicada perceptual de outro apenado (Hamming Distance <= 2)`;
            duplicateOfId = duplicateHash.apenadoId;
          }

          // Camada 2: Similaridade por cosseno do ArcFace (> 0.98) se o embedding existir
          if (status === 'CLEAN' && record.faceDescriptor && record.faceDescriptor !== 'NONE' && pvecAvail) {
            try {
              const embedding: number[] = JSON.parse(record.faceDescriptor);
              const matches = await searchByVector(embedding, 0.98, 1, res.id);
              if (matches.length > 0) {
                status = 'DUPLICATE';
                reason = `Duplicada vetorial ArcFace (similaridade de ${Math.round(matches[0].similarity * 100)}%)`;
                duplicateOfId = matches[0].id;
              }
            } catch {}
          }
        }

        // 5. Aplicar ações baseadas no veredito
        if (status === 'CLEAN') {
          // Aprovada: apenas registra log e mantém a foto no lugar
          await prisma.imageSanitization.create({
            data: {
              apenadoId: res.id,
              photoPath: record.photoPath,
              originalPath: record.photoPath,
              status: 'CLEAN',
              score,
              hashPerceptual: res.dhash ?? null,
              reason: 'Imagem de rosto válida e de boa qualidade',
            },
          });
          state.progress.clean++;
        } else {
          // Inadequada: Mover arquivo para pasta de quarentena
          const folderMap = {
            NO_FACE: 'sem_rosto',
            LOW_QUALITY: 'baixa_qualidade',
            DUPLICATE: 'duplicadas',
          };
          const subfolder = folderMap[status as 'NO_FACE' | 'LOW_QUALITY' | 'DUPLICATE'];
          const baseUploads = uploadsDir.replace(/apenados$/, ''); // uploads/
          const destDir = join(baseUploads, 'quarentena', subfolder);
          await mkdir(destDir, { recursive: true });

          const fileBase = basename(record.photoPath);
          const destPathAbs = join(destDir, fileBase);
          const srcPathAbs = getApenadoPhotoPath(record.photoPath);

          if (existsSync(srcPathAbs)) {
            await rename(srcPathAbs, destPathAbs);
          }

          const relativeDestPath = `uploads/quarentena/${subfolder}/${fileBase}`;

          // Desvincular foto e embedding do apenado local para retirar do ArcFace
          await prisma.apenado.update({
            where: { id: res.id },
            data: {
              photoPath: null,
              faceDescriptor: null,
              detScore: null,
            },
          });

          // Se pgvector estiver disponível, remove o vetor do índice
          if (pvecAvail) {
            await clearVector(res.id);
          }

          // Grava a sanitização e o log de quarentena
          await prisma.imageSanitization.create({
            data: {
              apenadoId: res.id,
              photoPath: relativeDestPath,
              originalPath: record.photoPath,
              status,
              score,
              hashPerceptual: res.dhash ?? null,
              reason,
              duplicateOfId,
            },
          });

          if (status === 'NO_FACE') state.progress.noFace++;
          if (status === 'LOW_QUALITY') state.progress.lowQuality++;
          if (status === 'DUPLICATE') state.progress.duplicate++;
        }
      } catch (err: any) {
        state.progress.errors++;
        console.error(`[Higienização] Erro ao processar registro #${res.id}:`, err);
      }
    }

    state.progress.current += records.length;
    // Invalida o cache do ArcFace para atualizar as buscas após modificações
    invalidateFaceCache();
  }

  state.isRunning = false;
}
