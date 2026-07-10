/**
 * Next.js Instrumentation Hook — roda uma vez no boot do servidor.
 * Inicializa pgvector (extensão, coluna faceVector, índice HNSW) e
 * migra embeddings existentes (faceDescriptor → faceVector) automaticamente.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Roda apenas no runtime Node.js (não no Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const {
        initPgVector,
        populateVectorsFromDescriptors,
        populateServidoresVectorsFromDescriptors,
        populateVisitantesVectorsFromDescriptors,
        getPgVectorStats,
      } = await import('@/lib/pgvector');

      const init = await initPgVector();

      if (!init.ok) {
        console.warn('[pgvector] Falha na inicialização automática:', init.error);
        console.warn('[pgvector] Busca facial usará fallback em memória.');
      } else {
        const migratedApenados = await populateVectorsFromDescriptors(500);
        const migratedServidores = await populateServidoresVectorsFromDescriptors(500);
        const migratedVisitantes = await populateVisitantesVectorsFromDescriptors(500);
        const stats = await getPgVectorStats();
        
        const totalMigrated = migratedApenados + migratedServidores + migratedVisitantes;
        console.log(
          `[pgvector] ✓ Inicializado — ${stats.vectorCount} vetores clássicos` +
            (totalMigrated > 0 
              ? ` (+${totalMigrated} sincronizados no boot: apenados: ${migratedApenados}, servidores: ${migratedServidores}, visitantes: ${migratedVisitantes})` 
              : '') +
            ` | índice HNSW: ${stats.indexExists ? 'ativo' : 'ausente'}`,
        );
      }
    } catch (err) {
      // Nunca deixa o boot falhar — pgvector é opcional
      console.warn('[pgvector] Erro no boot, fallback em memória ativo:', err);
    }
  }
}
