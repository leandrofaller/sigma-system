import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const sipeId = 64403
  console.log(`=== CONSULTANDO DADOS PARA O SIPE ID ${sipeId} ===`)
  
  const sipeImportado = await prisma.sipeApenadoImportado.findUnique({
    where: { sipeId },
    include: { faccao: true }
  })
  console.log('SipeApenadoImportado:', sipeImportado ? {
    id: sipeImportado.id,
    nome: sipeImportado.nome,
    unidade: sipeImportado.unidade,
    cela: sipeImportado.cela,
    situacao: sipeImportado.situacao,
    ultimaSyncAt: sipeImportado.ultimaSyncAt
  } : 'Não encontrado')

  const aipApenado = await prisma.aIPApenado.findUnique({
    where: { sipeId }
  })
  console.log('AIPApenado:', aipApenado ? {
    id: aipApenado.id,
    nome: aipApenado.nome,
    unidade: aipApenado.unidade,
    cela: aipApenado.cela,
    situacao: aipApenado.situacao,
    ultimaSincAt: aipApenado.ultimaSincAt
  } : 'Não encontrado')

  console.log('\n=== ÚLTIMOS JOBS DE SINCRONIZAÇÃO ===')
  const jobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3
  })
  
  for (const job of jobs) {
    console.log(`Job ID: ${job.id} | Tipo: ${job.tipo} | Unidade: ${job.unidade} (${job.unidadeNome}) | Status: ${job.status}`)
    console.log(`Iniciado em: ${job.iniciadoEm} | Finalizado em: ${job.finalizadoEm}`)
    console.log('Logs (últimos 300 caracteres):', job.log ? job.log.slice(-300) : 'Nenhum')
    console.log('------------------------------------')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
