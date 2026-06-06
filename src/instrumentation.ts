/**
 * Next.js Instrumentation Hook — roda uma vez no boot do servidor.
 * Inicializa pgvector (extensão, coluna faceVector, índice HNSW) e
 * migra embeddings existentes (faceDescriptor → faceVector) automaticamente.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Roda apenas no runtime Node.js (não no Edge runtime)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { initPgVector, populateVectorsFromDescriptors, getPgVectorStats } = await import(
      '@/lib/pgvector'
    );

    const init = await initPgVector();

    if (!init.ok) {
      console.warn('[pgvector] Falha na inicialização automática:', init.error);
      console.warn('[pgvector] Busca facial usará fallback em memória.');
      return;
    }

    // Migra embeddings que ainda não têm faceVector (novos registros ou pós-indexação)
    const migrated = await populateVectorsFromDescriptors(500);

    const stats = await getPgVectorStats();
    console.log(
      `[pgvector] ✓ Inicializado — ${stats.vectorCount} vetores indexados` +
        (migrated > 0 ? ` (+${migrated} migrados agora)` : '') +
        ` | índice HNSW: ${stats.indexExists ? 'ativo' : 'ausente'}`,
    );
    // Inicia a migração e geração automática de novos embeddings avançados em background
    const { startAdvancedJob } = await import('@/lib/advanced-indexing-job');
    startAdvancedJob();

    console.log('[IA Facial] ✓ Inicialização e migração em background iniciadas.');
  } catch (err) {
    // Nunca deixa o boot falhar — pgvector é opcional
    console.warn('[pgvector] Erro no boot, fallback em memória ativo:', err);
  }
}
