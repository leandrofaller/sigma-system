import { startServidoresSync } from '../src/lib/sejus-servidores-scraper';
import { prisma } from '../src/lib/db';
import * as fs from 'fs';
import * as path from 'path';

// Carrega .env manualmente
function loadEnv() {
  const envPath = path.resolve('f:\\relatorio_claude\\.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    });
  }
}

loadEnv();

async function run() {
  console.log("Iniciando teste de execução do SGP Scraper...");
  
  // Limpa estados de jobs anteriores travados
  await prisma.sipeSyncJob.updateMany({
    where: { status: 'RUNNING', tipo: 'SERVIDORES' },
    data: { status: 'INTERRUPTED', finalizadoEm: new Date() }
  });

  // Cria um job de teste
  const job = await prisma.sipeSyncJob.create({
    data: {
      tipo: 'SERVIDORES',
      unidade: 'ALL',
      unidadeNome: 'SGP SEJUS - Servidores (TESTE)',
      status: 'RUNNING',
      iniciadoEm: new Date(),
    }
  });

  console.log(`Job criado: ${job.id}`);

  // Inicia sincronização
  startServidoresSync(job.id);

  // Monitora progresso
  const interval = setInterval(async () => {
    const currentJob = await prisma.sipeSyncJob.findUnique({
      where: { id: job.id }
    });

    if (!currentJob) {
      console.log("Job não encontrado!");
      clearInterval(interval);
      return;
    }

    console.log(`\n--- [STATUS: ${currentJob.status}] Fase: ${currentJob.fase || 'N/A'} ---`);
    console.log(`Processados: ${currentJob.processado}/${currentJob.total} | Erros: ${currentJob.erros}`);
    
    // Logs recentes
    const logs = currentJob.log ? currentJob.log.split('\n') : [];
    const recentLogs = logs.slice(-3);
    console.log("Últimos logs:");
    recentLogs.forEach(l => console.log(`  > ${l}`));

    if (currentJob.status !== 'RUNNING') {
      console.log(`\nSincronização finalizada com status: ${currentJob.status}`);
      clearInterval(interval);
      
      // Se falhou por credenciais no login (o que esperamos com CPF não cadastrado),
      // o teste foi um sucesso, pois validamos que as requisições HTTP bateram certinho.
      if (currentJob.status === 'FAILED' && currentJob.log?.includes('CPF não encontrado')) {
        console.log("\n✅ SUCESSO: O scraper tentou fazer login e a resposta de erro do Laravel SGP foi capturada e tratada corretamente!");
      }
      
      process.exit(0);
    }
  }, 2000);
}

run().catch(err => {
  console.error("Erro no teste:", err);
});
