import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient()

const FACE_SIM_THRESHOLD = 0.72; // cosine similarity >= 0.72 → mesmo indivíduo
const FACE_HAMMING_THRESHOLD = 20; // Hamming <= 20
const FACE_BATCH_SIZE = 5000;

function popcount32(x: number): number {
  x = x | 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(x, 0x01010101) >>> 24);
}

function buildProjectionMatrix(): Float32Array {
  const DIMS = 512;
  const PROJ = 64;
  const proj = new Float32Array(PROJ * DIMS);
  let seed = 0xDEADBEEF >>> 0;
  const lcg = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0xFFFFFFFF) * 2 - 1; // [-1, 1)
  };
  for (let p = 0; p < PROJ; p++) {
    let norm = 0;
    const base = p * DIMS;
    for (let d = 0; d < DIMS; d++) {
      const v = lcg();
      proj[base + d] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm);
    for (let d = 0; d < DIMS; d++) proj[base + d] /= norm;
  }
  return proj;
}

async function testOtimizado() {
  console.log('🚀 Iniciando teste com lógica otimizada de LSH para Face descriptors...')
  const projMatrix = buildProjectionMatrix();
  const DIMS = 512;
  const PROJ = 64;

  const ids: string[] = [];
  const allVecs: Float32Array[] = [];
  let cursor = '';

  console.log('⏳ Carregando embeddings do banco de dados (Limite de 15.000 para teste rápido)...')
  
  const limitCount = 15000;
  let loaded = 0;

  const tStartLoad = Date.now();
  let page = 1;
  while (loaded < limitCount) {
    const tBatchStart = Date.now();
    // Usando WHERE faceDescriptor IS NOT NULL AND faceDescriptor != ''
    const batch = await prisma.$queryRaw<{ id: string; fd: string }[]>`
      SELECT id, "faceDescriptor" AS fd
      FROM apenados
      WHERE "faceDescriptor" IS NOT NULL
        AND "faceDescriptor" != ''
        AND id > ${cursor}
      ORDER BY id ASC
      LIMIT ${FACE_BATCH_SIZE}
    `;
    console.log(`[PAGE ${page}] SQL Query retornou ${batch.length} linhas em ${(Date.now() - tBatchStart)/1000}s`)
    if (batch.length === 0) break;

    const tParseStart = Date.now();
    for (const row of batch) {
      try {
        const arr: number[] = JSON.parse(row.fd);
        if (!Array.isArray(arr) || arr.length !== DIMS) continue;
        const vec = new Float32Array(DIMS);
        for (let d = 0; d < DIMS; d++) vec[d] = arr[d];
        ids.push(row.id);
        allVecs.push(vec);
        loaded++;
        if (loaded >= limitCount) break;
      } catch {
        // skip invalid
      }
    }
    console.log(`[PAGE ${page}] Parse de JSON e preparação levou ${(Date.now() - tParseStart)/1000}s. Total carregado: ${loaded}`)

    cursor = batch[batch.length - 1].id;
    if (batch.length < FACE_BATCH_SIZE) break;
    page++;
  }

  const N = ids.length;
  console.log(`⏱️ Tempo total de carregamento de ${N} registros: ${(Date.now() - tStartLoad) / 1000}s`)
  if (N < 2) {
    console.log('Sem embeddings suficientes no banco para testar.')
    return;
  }

  // Pack all vectors
  const vecArray = new Float32Array(N * DIMS);
  for (let i = 0; i < N; i++) vecArray.set(allVecs[i], i * DIMS);

  // Compute SimHash
  console.log('⏳ Computando SimHash 64-bit...')
  const tStartSimHash = Date.now();
  const simLo = new Int32Array(N);
  const simHi = new Int32Array(N);

  for (let i = 0; i < N; i++) {
    let lo = 0, hi = 0;
    const vBase = i * DIMS;
    for (let p = 0; p < PROJ; p++) {
      let dot = 0;
      const pBase = p * DIMS;
      for (let d = 0; d < DIMS; d++) dot += vecArray[vBase + d] * projMatrix[pBase + d];
      if (dot > 0) {
        if (p < 32) lo |= (1 << p);
        else hi |= (1 << (p - 32));
      }
    }
    simLo[i] = lo;
    simHi[i] = hi;
  }
  console.log(`⏱️ Tempo computar SimHash: ${(Date.now() - tStartSimHash) / 1000}s`)

  // ── LSH Bucket Indexing for Face SimHash ──────────────────────────────────
  console.log('⏳ Indexando SimHashes em baldes LSH...')
  const tStartLSH = Date.now();
  const faceBandMaps: Map<number, number[]>[] = [new Map(), new Map(), new Map(), new Map()];
  const MAX_FACE_BUCKET_SIZE = 100;

  for (let i = 0; i < N; i++) {
    const lo = simLo[i];
    const hi = simHi[i];
    const bands = [
      lo & 0xffff,
      (lo >>> 16) & 0xffff,
      hi & 0xffff,
      (hi >>> 16) & 0xffff,
    ];
    for (let b = 0; b < 4; b++) {
      const val = bands[b];
      const bucket = faceBandMaps[b].get(val);
      if (!bucket) {
        faceBandMaps[b].set(val, [i]);
      } else if (bucket.length < MAX_FACE_BUCKET_SIZE) {
        bucket.push(i);
      }
    }
  }

  // Coletar pares de candidatos
  const faceCandidatePairs = new Set<string>();
  for (const bm of faceBandMaps) {
    for (const indices of bm.values()) {
      if (indices.length < 2) continue;
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          const idxA = indices[i];
          const idxB = indices[j];
          const a = idxA < idxB ? idxA : idxB;
          const b = idxA < idxB ? idxB : idxA;
          faceCandidatePairs.add(`${a}|${b}`);
        }
      }
    }
  }
  console.log(`⏱️ Tempo LSH + candidatos (${faceCandidatePairs.size} pares candidatos): ${(Date.now() - tStartLSH) / 1000}s`)

  // Pairwise exact cosine verification for candidates
  console.log('⏳ Comparando candidatos e validando similaridade exata...')
  const tStartCosine = Date.now();
  let matchesCount = 0;

  for (const pair of faceCandidatePairs) {
    const [idxAStr, idxBStr] = pair.split('|');
    const idxA = parseInt(idxAStr, 10);
    const idxB = parseInt(idxBStr, 10);

    const hamming = popcount32(simLo[idxA] ^ simLo[idxB]) + popcount32(simHi[idxA] ^ simHi[idxB]);
    if (hamming <= FACE_HAMMING_THRESHOLD) {
      const iBase = idxA * DIMS, jBase = idxB * DIMS;
      let dot = 0;
      for (let d = 0; d < DIMS; d++) dot += vecArray[iBase + d] * vecArray[jBase + d];
      if (dot >= FACE_SIM_THRESHOLD) {
        matchesCount++;
      }
    }
  }
  console.log(`⏱️ Tempo verificação cosseno: ${(Date.now() - tStartCosine) / 1000}s`)
  console.log(`🎉 Sucesso! Encontrados ${matchesCount} pares correspondentes.`)
  console.log(`⏱️ Tempo total de processamento: ${(Date.now() - tStartSimHash) / 1000}s`)
}

testOtimizado().catch(console.error).finally(() => prisma.$disconnect())
