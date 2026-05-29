import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const jobs = await prisma.sipeSyncJob.findMany({
    where: { tipo: 'FACCOES' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      tipo: true,
      status: true,
      processado: true,
      erros: true,
      log: true,
      createdAt: true,
      finalizadoEm: true
    }
  })

  console.log('=== SYNC JOBS (FACCOES) ===\n')
  if (jobs.length === 0) {
    console.log('Nenhum sync job de FACCOES encontrado\n')
  } else {
    for (const job of jobs) {
      console.log(`ID: ${job.id}`)
      console.log(`Status: ${job.status}`)
      console.log(`Criado: ${job.createdAt}`)
      console.log(`Finalizado: ${job.finalizadoEm}`)
      console.log(`Processado: ${job.processado}, Erros: ${job.erros}`)
      if (job.log) console.log(`Log: ${job.log.substring(0, 200)}...`)
      console.log('---')
    }
  }

  const faccoes = await prisma.sipeFaccao.findMany({
    select: { id: true, sipeId: true, nome: true, sigla: true }
  })

  console.log('\n=== FACCOES NO BANCO ===\n')
  console.log(`Total: ${faccoes.length}`)
  if (faccoes.length > 0) {
    for (const f of faccoes) {
      console.log(`  SIPE ID ${f.sipeId}: ${f.nome}${f.sigla ? ` (${f.sigla})` : ''}`)
    }
  }

  // Check all sync jobs
  const allJobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      tipo: true,
      status: true,
      createdAt: true
    }
  })

  console.log('\n=== TODOS OS SYNC JOBS RECENTES ===\n')
  for (const job of allJobs) {
    console.log(`${job.tipo}: ${job.status} (${job.createdAt})`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
