import { prisma } from '../src/lib/db';
import { startVisitantesSync } from '../src/lib/visitantes-scraper';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('Criando Job de sincronização de visitantes no DB...');
  const user = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' }
  });
  if (!user) {
    throw new Error('Nenhum usuário SUPER_ADMIN encontrado para associar ao Job.');
  }

  // Define a engine como python-sdk
  (globalThis as any).__sipeCurrentEngine = 'python-sdk';

  const job = await prisma.sipeSyncJob.create({
    data: {
      tipo: 'VISITANTES',
      unidade: 'ALL',
      unidadeNome: 'Sincronização de Visitantes (Teste CLI)',
      status: 'RUNNING',
      iniciadoEm: new Date(),
      criadoPor: user.id,
    },
  });

  console.log(`Job criado com ID: ${job.id}. Iniciando sincronização...`);
  
  startVisitantesSync(job.id);
  
  // Vamos aguardar o job terminar de rodar monitorando seu status no banco
  console.log('Monitorando progresso do Job no banco de dados...');
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const currentJob = await prisma.sipeSyncJob.findUnique({
          where: { id: job.id }
        });
        if (!currentJob) {
          clearInterval(interval);
          reject(new Error('Job sumiu do banco de dados!'));
          return;
        }
        
        console.log(`\n[Status: ${currentJob.status}] Fase: ${currentJob.fase} | Processado: ${currentJob.processado}/${currentJob.total}`);
        if (currentJob.log) {
          const lastLines = currentJob.log.trim().split('\n').slice(-5);
          console.log('Últimos Logs:');
          lastLines.forEach(l => console.log('  ', l));
        }
        
        if (currentJob.status !== 'RUNNING') {
          clearInterval(interval);
          console.log(`\nSincronização finalizada com status: ${currentJob.status}`);
          resolve();
        }
      } catch (err) {
        console.error('Erro ao ler progresso do Job:', err);
      }
    }, 4000);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
