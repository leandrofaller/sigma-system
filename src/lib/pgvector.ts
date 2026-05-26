/**
 * Utilitário para busca facial via pgvector (índice HNSW coseno).
 * Requer PostgreSQL com extensão vector instalada e coluna "faceVector" na tabela apenados.
 * Todas as operações falham silenciosamente se pgvector não estiver disponível,
 * permitindo fallback transparente para a busca em memória.
 */
import { prisma } from './db';

// Cache da disponibilidade — evita checar o banco a cada request
let _available: boolean | null = null;

/** Verifica se pgvector está instalado E a coluna faceVector existe. */
export async function pgvectorAvailable(): Promise<boolean> {
  if (_available !== null) return _available;
  try {
    const rows = await prisma.$queryRaw<[{ ext: bigint; col: bigint }]>`
      SELECT
        (SELECT COUNT(*) FROM pg_extension WHERE extname = 'vector') AS ext,
        (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'apenados' AND column_name = 'faceVector') AS col
    `;
    const r = rows[0];
    _available = Number(r.ext) > 0 && Number(r.col) > 0;
  } catch {
    _available = false;
  }
  return _available;
}

/** Reseta o cache de disponibilidade (útil após initPgVector). */
export function resetPgVectorStatus(): void {
  _available = null;
}

/** Retorna estatísticas do índice vetorial. */
export async function getPgVectorStats(): Promise<{
  available: boolean;
  vectorCount: number;
  indexExists: boolean;
}> {
  const available = await pgvectorAvailable();
  if (!available) return { available: false, vectorCount: 0, indexExists: false };

  try {
    const [countRow] = await prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(*) AS c FROM apenados WHERE "faceVector" IS NOT NULL
    `;
    const [idxRow] = await prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(*) AS c FROM pg_indexes
      WHERE tablename = 'apenados' AND indexname = 'apenados_face_hnsw_idx'
    `;
    return {
      available: true,
      vectorCount: Number(countRow.c),
      indexExists: Number(idxRow.c) > 0,
    };
  } catch {
    return { available: true, vectorCount: 0, indexExists: false };
  }
}

/**
 * Inicializa suporte a pgvector:
 * 1. Cria extensão vector se não existir
 * 2. Adiciona coluna faceVector vector(512) se não existir
 * 3. Cria índice HNSW para busca coseno eficiente
 *
 * Seguro chamar múltiplas vezes (IF NOT EXISTS em todos os statements).
 */
export async function initPgVector(): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE apenados ADD COLUMN IF NOT EXISTS "faceVector" vector(512)`,
    );
    // HNSW: m=16 (conectividade), ef_construction=64 (qualidade do índice na construção)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS apenados_face_hnsw_idx
      ON apenados USING hnsw ("faceVector" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
    _available = true;
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Popula faceVector a partir do faceDescriptor existente (migração de dados).
 * Processa em lotes para não travar o banco.
 * Retorna quantos registros foram atualizados.
 */
export async function populateVectorsFromDescriptors(batchSize = 500): Promise<number> {
  let total = 0;
  let lastId = '';

  while (true) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; faceDescriptor: string }>>(
      `SELECT id, "faceDescriptor" FROM apenados
       WHERE "faceDescriptor" LIKE '[%'
         AND "faceVector" IS NULL
         AND id > $1
       ORDER BY id ASC
       LIMIT $2`,
      lastId,
      batchSize,
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const vec = row.faceDescriptor.trim(); // já é um JSON array válido
        await prisma.$executeRawUnsafe(
          `UPDATE apenados SET "faceVector" = $1::vector WHERE id = $2`,
          vec,
          row.id,
        );
        total++;
      } catch {}
    }

    lastId = rows[rows.length - 1].id;
  }

  return total;
}

/**
 * Salva um embedding como faceVector para um apenado.
 * Não lança exceção — falhas são silenciosas para não bloquear o caminho principal.
 */
export async function upsertVector(id: string, embedding: number[]): Promise<void> {
  const vec = `[${embedding.join(',')}]`;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE apenados SET "faceVector" = $1::vector WHERE id = $2`,
      vec,
      id,
    );
  } catch {}
}

export interface VectorMatch {
  id: string;
  similarity: number; // 0–1 (coseno)
}

/**
 * Busca apenados com faceVector mais próximo ao embedding fornecido.
 * Usa o índice HNSW para busca aproximada eficiente (coseno).
 *
 * @param embedding  Array de 512 floats L2-normalizados
 * @param threshold  Similaridade mínima 0–1
 * @param topN       Máximo de resultados
 * @param excludeId  ID a excluir dos resultados (para busca "similar a este")
 */
export async function searchByVector(
  embedding: number[],
  threshold: number,
  topN: number,
  excludeId?: string,
): Promise<VectorMatch[]> {
  const vec = `[${embedding.join(',')}]`;
  const maxDist = 1 - threshold; // distância coseno = 1 − similaridade

  try {
    let rows: Array<{ id: string; sim: number }>;

    if (excludeId) {
      rows = await prisma.$queryRawUnsafe<Array<{ id: string; sim: number }>>(
        `SELECT id, (1 - ("faceVector" <=> $1::vector)) AS sim
         FROM apenados
         WHERE "faceVector" IS NOT NULL
           AND id != $2
           AND ("faceVector" <=> $1::vector) <= $3
         ORDER BY "faceVector" <=> $1::vector ASC
         LIMIT $4`,
        vec,
        excludeId,
        maxDist,
        topN,
      );
    } else {
      rows = await prisma.$queryRawUnsafe<Array<{ id: string; sim: number }>>(
        `SELECT id, (1 - ("faceVector" <=> $1::vector)) AS sim
         FROM apenados
         WHERE "faceVector" IS NOT NULL
           AND ("faceVector" <=> $1::vector) <= $2
         ORDER BY "faceVector" <=> $1::vector ASC
         LIMIT $3`,
        vec,
        maxDist,
        topN,
      );
    }

    return rows.map((r) => ({ id: r.id, similarity: r.sim }));
  } catch {
    return [];
  }
}
