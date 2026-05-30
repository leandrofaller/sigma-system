import { prisma } from '../src/lib/db';
import { startCnaAllSync } from '../src/lib/sipe-scraper';

async function main() {
  console.log('Iniciando teste de Job CNA persistido no banco de dados...');

  // 1. Limpar qualquer job RUNNING antigo no banco para não travar
  await prisma.sipeSyncJob.updateMany({
    where: { status: 'RUNNING' },
    data: { status: 'INTERRUPTED', finalizadoEm: new Date() }
  });

  const advogados = await prisma.sipeAdvogado.findMany({
    where: { oab: { not: null } },
    select: { id: true, oab: true, nome: true }
  });

  console.log(`Advogados com OAB encontrados no banco: ${advogados.length}`);
  if (advogados.length === 0) {
    console.log('Nenhum advogado cadastrado no banco local. Cadastrando um stub...');
    await prisma.sipeAdvogado.create({
      data: {
        sipeId: 987654,
        nome: 'ABDIEL AFONSO FIGUEIRA',
        oab: '3092/RO',
        cpf: '000.000.000-00',
        telefone: '6934415454'
      }
    });
  }

  // 2. Criar o job no banco
  const job = await prisma.sipeSyncJob.create({
    data: {
      tipo: 'ADVOGADOS_CNA',
      unidade: 'ALL',
      unidadeNome: 'CNA - Cadastro Nacional dos Advogados',
      status: 'RUNNING',
      total: advogados.length || 1,
      iniciadoEm: new Date(),
      fase: 'Iniciando',
      log: 'Iniciando teste de sincronização CNA...'
    }
  });

  console.log(`Job criado no banco com ID: ${job.id}`);

  // 3. Chamar startCnaAllSync (que roda em background e atualiza o banco)
  startCnaAllSync(job.id);

  console.log('Monitorando o progresso do job no banco de dados a cada 2 segundos...');
  
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const currentJob = await prisma.sipeSyncJob.findUnique({
      where: { id: job.id }
    });

    if (currentJob) {
      console.log(`[Status Job] Status: ${currentJob.status} | Progresso: ${currentJob.processado}/${currentJob.total} | Fase: ${currentJob.fase}`);
      console.log(`[Status Job] Último log:`);
      const logs = currentJob.log ? currentJob.log.split('\n') : [];
      console.log(logs.slice(-2).join('\n'));
      console.log('--------------------------------------------------');
      
      if (currentJob.status !== 'RUNNING') {
        console.log('O job finalizou!');
        break;
      }
    }
  }

  console.log('Fim do monitoramento.');
}

main().catch(console.error);
