import { prisma } from '../src/lib/db'

async function main() {
  try {
    const jobs = await prisma.sipeSyncJob.findMany({
      orderBy: { iniciadoEm: 'desc' },
      take: 5
    })
    console.log('Últimos 5 jobs de sincronização:')
    console.log(JSON.stringify(jobs.map(j => ({
      id: j.id,
      tipo: j.tipo,
      unidade: j.unidade,
      status: j.status,
      total: j.total,
      processado: j.processado,
      erros: j.erros,
      iniciadoEm: j.iniciadoEm,
      finalizadoEm: j.finalizadoEm,
      // Mostrar apenas o início do log
      logSnippet: j.log ? j.log.slice(0, 500) : null
    })), null, 2))
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
