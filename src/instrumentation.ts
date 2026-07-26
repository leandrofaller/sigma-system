/**
 * Next.js Instrumentation Hook — roda uma vez no boot do servidor.
 * Inicializa pgvector (extensão, coluna faceVector, índice HNSW) e
 * migra embeddings existentes (faceDescriptor → faceVector) automaticamente.
 * Também dispara a remediação dos visitantes homônimos em background.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Roda apenas no runtime Node.js (não no Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // IMPORTANTE: agendado ANTES do pgvector. Só registra um timer (não bloqueia),
    // e assim não depende dos await do pgvector abaixo — se aquele bloco travar
    // (criar o índice HNSW pega lock e pode demorar), a remediação ainda acontece.
    try {
      const { startVisitantesHomonimosRemediation } = await import(
        '@/lib/visitantes-homonimos-remediation'
      );
      startVisitantesHomonimosRemediation();
    } catch (err) {
      console.warn('[REMEDIACAO VISITANTES] Erro ao agendar remediação no boot:', err);
    }

    // Executa inicialização do pgvector e migrações em background (sem travar o boot do Next.js)
    import('@/lib/pgvector')
      .then(async ({
        initPgVector,
        populateVectorsFromDescriptors,
        populateServidoresVectorsFromDescriptors,
        populateVisitantesVectorsFromDescriptors,
        getPgVectorStats,
      }) => {
        console.log('[pgvector] Iniciando inicialização do pgvector em background...');
        const init = await initPgVector();

        if (!init.ok) {
          console.warn('[pgvector] Falha na inicialização em background:', init.error);
          console.warn('[pgvector] Busca facial usará fallback em memória.');
        } else {
          const migratedApenados = await populateVectorsFromDescriptors(500);
          const migratedServidores = await populateServidoresVectorsFromDescriptors(500);
          const migratedVisitantes = await populateVisitantesVectorsFromDescriptors(500);
          const stats = await getPgVectorStats();
          
          const totalMigrated = migratedApenados + migratedServidores + migratedVisitantes;
          console.log(
            `[pgvector] ✓ Inicializado em background — ${stats.vectorCount} vetores clássicos` +
              (totalMigrated > 0 
                ? ` (+${totalMigrated} sincronizados no boot: apenados: ${migratedApenados}, servidores: ${migratedServidores}, visitantes: ${migratedVisitantes})` 
                : '') +
              ` | índice HNSW: ${stats.indexExists ? 'ativo' : 'ausente'}`,
          );
        }
      })
      .catch((err) => {
        console.warn('[pgvector] Erro na inicialização em background, fallback em memória ativo:', err);
      });
  }
}
