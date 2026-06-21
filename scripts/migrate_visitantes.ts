import { initPgVector, populateVisitantesVectorsFromDescriptors } from '../src/lib/pgvector';

async function main() {
  console.log('Iniciando migração de vetores de visitantes...');
  console.log('1. Inicializando pgvector se necessário (extensão, colunas, índices)...');
  const initRes = await initPgVector();
  if (!initRes.ok) {
    console.error('Erro ao inicializar pgvector:', initRes.error);
    process.exit(1);
  }
  console.log('pgvector inicializado com sucesso.');

  console.log('2. Populando coluna faceVector a partir do faceDescriptor para visitantes...');
  const total = await populateVisitantesVectorsFromDescriptors(500);
  console.log(`Migração concluída! Total de visitantes atualizados nesta execução: ${total}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro fatal durante a migração:', err);
  process.exit(1);
});
