/**
 * Utilitário para busca facial via pgvector (índice HNSW coseno).
 * Requer PostgreSQL com extensão vector instalada e coluna "faceVector" na tabela apenados.
 * Todas as operações falham silenciosamente se pgvector não estiver disponível,
 * permitindo fallback transparente para a busca em memória.
 */
import { prisma } from './db';

// Cache da disponibilidade — evita checar o banco a cada request
let _available: boolean | null = null;
let _availableAdvanced: boolean | null = null;

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

/** Verifica se a coluna faceVectorAdvanced existe. */
export async function pgvectorAdvancedAvailable(): Promise<boolean> {
  if (_availableAdvanced !== null) return _availableAdvanced;
  try {
    const rows = await prisma.$queryRaw<[{ ext: bigint; col: bigint }]>`
      SELECT
        (SELECT COUNT(*) FROM pg_extension WHERE extname = 'vector') AS ext,
        (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'apenados' AND column_name = 'faceVectorAdvanced') AS col
    `;
    const r = rows[0];
    _availableAdvanced = Number(r.ext) > 0 && Number(r.col) > 0;
  } catch {
    _availableAdvanced = false;
  }
  return _availableAdvanced;
}

/** Reseta o cache de disponibilidade (útil após initPgVector). */
export function resetPgVectorStatus(): void {
  _available = null;
  _availableAdvanced = null;
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
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS apenados_face_hnsw_idx
      ON apenados USING hnsw ("faceVector" vector_cosine_ops)
      WITH (m = 32, ef_construction = 128)
    `);

    // Inicializa suporte avançado
    await prisma.$executeRawUnsafe(
      `ALTER TABLE apenados ADD COLUMN IF NOT EXISTS "faceVectorAdvanced" vector(512)`,
    );
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS apenados_face_advanced_hnsw_idx
      ON apenados USING hnsw ("faceVectorAdvanced" vector_cosine_ops)
      WITH (m = 32, ef_construction = 128)
    `);

    // Inicializa suporte para visitantes
    await prisma.$executeRawUnsafe(
      `ALTER TABLE sipe_visitantes ADD COLUMN IF NOT EXISTS "faceVector" vector(512)`,
    );
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS visitantes_face_hnsw_idx
      ON sipe_visitantes USING hnsw ("faceVector" vector_cosine_ops)
      WITH (m = 32, ef_construction = 128)
    `);

    // Inicializa suporte para servidores
    await prisma.$executeRawUnsafe(
      `ALTER TABLE sejus_servidores ADD COLUMN IF NOT EXISTS "faceVector" vector(512)`,
    );
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS servidores_face_hnsw_idx
      ON sejus_servidores USING hnsw ("faceVector" vector_cosine_ops)
      WITH (m = 32, ef_construction = 128)
    `);

    _available = true;
    _availableAdvanced = true;
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

/** Remove o faceVector de um apenado. Silencioso — não lança exceção. */
export async function clearVector(id: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE apenados SET "faceVector" = NULL WHERE id = $1`,
      id,
    );
  } catch {}
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

/** Salva embedding da IA Facial em faceVectorAdvanced. */
export async function upsertVectorAdvanced(id: string, embedding: number[]): Promise<void> {
  const vec = `[${embedding.join(',')}]`;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE apenados SET "faceVectorAdvanced" = $1::vector WHERE id = $2`,
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
    // SET LOCAL hnsw.ef_search = 100: aumenta candidatos avaliados pelo índice HNSW
    // de 40 (padrão) para 100 → ~10-20% mais recall em buscas próximas do threshold.
    // SET LOCAL é scoped à transação — seguro com connection pooling.
    let rows: Array<{ id: string; sim: number }>;

    if (excludeId) {
      rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL hnsw.ef_search = 100');
        return tx.$queryRawUnsafe<Array<{ id: string; sim: number }>>(
          `SELECT id, (1 - ("faceVector" <=> $1::vector)) AS sim
           FROM apenados
           WHERE "faceVector" IS NOT NULL
             AND "photoPath" IS NOT NULL
             AND id != $2
             AND ("faceVector" <=> $1::vector) <= $3
           ORDER BY "faceVector" <=> $1::vector ASC
           LIMIT $4`,
          vec,
          excludeId,
          maxDist,
          topN,
        );
      });
    } else {
      rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL hnsw.ef_search = 100');
        return tx.$queryRawUnsafe<Array<{ id: string; sim: number }>>(
          `SELECT id, (1 - ("faceVector" <=> $1::vector)) AS sim
           FROM apenados
           WHERE "faceVector" IS NOT NULL
             AND "photoPath" IS NOT NULL
             AND ("faceVector" <=> $1::vector) <= $2
           ORDER BY "faceVector" <=> $1::vector ASC
           LIMIT $3`,
          vec,
          maxDist,
          topN,
        );
      });
    }

    return rows.map((r) => ({ id: r.id, similarity: r.sim }));
  } catch {
    return [];
  }
}

/** Busca apenados com faceVectorAdvanced mais próximo ao embedding fornecido. */
export async function searchByVectorAdvanced(
  embedding: number[],
  threshold: number,
  topN: number,
  excludeId?: string,
): Promise<VectorMatch[]> {
  const vec = `[${embedding.join(',')}]`;
  const maxDist = 1 - threshold;

  try {
    let rows: Array<{ id: string; sim: number }>;

    if (excludeId) {
      rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL hnsw.ef_search = 100');
        return tx.$queryRawUnsafe<Array<{ id: string; sim: number }>>(
          `SELECT id, (1 - ("faceVectorAdvanced" <=> $1::vector)) AS sim
           FROM apenados
           WHERE "faceVectorAdvanced" IS NOT NULL
             AND "photoPath" IS NOT NULL
             AND id != $2
             AND ("faceVectorAdvanced" <=> $1::vector) <= $3
           ORDER BY "faceVectorAdvanced" <=> $1::vector ASC
           LIMIT $4`,
          vec,
          excludeId,
          maxDist,
          topN,
        );
      });
    } else {
      rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL hnsw.ef_search = 100');
        return tx.$queryRawUnsafe<Array<{ id: string; sim: number }>>(
          `SELECT id, (1 - ("faceVectorAdvanced" <=> $1::vector)) AS sim
           FROM apenados
           WHERE "faceVectorAdvanced" IS NOT NULL
             AND "photoPath" IS NOT NULL
             AND ("faceVectorAdvanced" <=> $1::vector) <= $2
           ORDER BY "faceVectorAdvanced" <=> $1::vector ASC
           LIMIT $3`,
          vec,
          maxDist,
          topN,
        );
      });
    }

    return rows.map((r) => ({ id: r.id, similarity: r.sim }));
  } catch {
    return [];
  }
}

/** Remove o faceVectorAdvanced de um apenado. */
export async function clearVectorAdvanced(id: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE apenados SET "faceVectorAdvanced" = NULL WHERE id = $1`,
      id,
    );
  } catch {}
}

/** Salva um embedding como faceVector para um visitante. */
export async function upsertVisitanteVector(id: string, embedding: number[]): Promise<void> {
  const vec = `[${embedding.join(',')}]`;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE sipe_visitantes SET "faceVector" = $1::vector WHERE id = $2`,
      vec,
      id,
    );
  } catch {}
}

/** Remove o faceVector de um visitante. */
export async function clearVisitanteVector(id: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE sipe_visitantes SET "faceVector" = NULL WHERE id = $1`,
      id,
    );
  } catch {}
}

/**
 * Busca visitantes com faceVector mais próximo ao embedding fornecido.
 */
export async function searchByVectorForVisitantes(
  embedding: number[],
  threshold: number,
  topN: number,
): Promise<VectorMatch[]> {
  const vec = `[${embedding.join(',')}]`;
  const maxDist = 1 - threshold;

  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL hnsw.ef_search = 100');
      return tx.$queryRawUnsafe<Array<{ id: string; sim: number }>>(
        `SELECT id, (1 - ("faceVector" <=> $1::vector)) AS sim
         FROM sipe_visitantes
         WHERE "faceVector" IS NOT NULL
           AND "photoPath" IS NOT NULL
           AND ("faceVector" <=> $1::vector) <= $2
         ORDER BY "faceVector" <=> $1::vector ASC
         LIMIT $3`,
        vec,
        maxDist,
        topN,
      );
    });

    return rows.map((r) => ({ id: r.id, similarity: r.sim }));
  } catch {
    return [];
  }
}

/** Busca visitantes para o pipeline de IA avançado usando o mesmo faceVector. */
export async function searchByVectorAdvancedForVisitantes(
  embedding: number[],
  threshold: number,
  topN: number,
): Promise<VectorMatch[]> {
  // Para visitantes, como não há vetor avançado específico, usamos o faceVector normal
  return searchByVectorForVisitantes(embedding, threshold, topN);
}

/**
 * Popula faceVector a partir do faceDescriptor existente para visitantes.
 */
export async function populateVisitantesVectorsFromDescriptors(batchSize = 500): Promise<number> {
  let total = 0;
  let lastId = '';

  while (true) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; faceDescriptor: string }>>(
      `SELECT id, "faceDescriptor" FROM sipe_visitantes
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
        const vec = row.faceDescriptor.trim();
        await prisma.$executeRawUnsafe(
          `UPDATE sipe_visitantes SET "faceVector" = $1::vector WHERE id = $2`,
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

/** Salva um embedding como faceVector para um servidor. */
export async function upsertServidorVector(id: string, embedding: number[]): Promise<void> {
  const vec = `[${embedding.join(',')}]`;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE sejus_servidores SET "faceVector" = $1::vector WHERE id = $2`,
      vec,
      id,
    );
  } catch {}
}

/** Remove o faceVector de um servidor. */
export async function clearServidorVector(id: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE sejus_servidores SET "faceVector" = NULL WHERE id = $1`,
      id,
    );
  } catch {}
}

/**
 * Busca servidores com faceVector mais próximo ao embedding fornecido.
 */
export async function searchByVectorForServidores(
  embedding: number[],
  threshold: number,
  topN: number,
): Promise<VectorMatch[]> {
  const vec = `[${embedding.join(',')}]`;
  const maxDist = 1 - threshold;

  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL hnsw.ef_search = 100');
      return tx.$queryRawUnsafe<Array<{ id: string; sim: number }>>(
        `SELECT id, (1 - ("faceVector" <=> $1::vector)) AS sim
         FROM sejus_servidores
         WHERE "faceVector" IS NOT NULL
           AND "photoPath" IS NOT NULL
           AND ("faceVector" <=> $1::vector) <= $2
         ORDER BY "faceVector" <=> $1::vector ASC
         LIMIT $3`,
        vec,
        maxDist,
        topN,
      );
    });

    return rows.map((r) => ({ id: r.id, similarity: r.sim }));
  } catch {
    return [];
  }
}

/** Busca servidores para o pipeline de IA avançado usando o mesmo faceVector. */
export async function searchByVectorAdvancedForServidores(
  embedding: number[],
  threshold: number,
  topN: number,
): Promise<VectorMatch[]> {
  return searchByVectorForServidores(embedding, threshold, topN);
}

/**
 * Popula faceVector a partir do faceDescriptor existente para servidores.
 */
export async function populateServidoresVectorsFromDescriptors(batchSize = 500): Promise<number> {
  let total = 0;
  let lastId = '';

  while (true) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; faceDescriptor: string }>>(
      `SELECT id, "faceDescriptor" FROM sejus_servidores
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
        const vec = row.faceDescriptor.trim();
        await prisma.$executeRawUnsafe(
          `UPDATE sejus_servidores SET "faceVector" = $1::vector WHERE id = $2`,
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

