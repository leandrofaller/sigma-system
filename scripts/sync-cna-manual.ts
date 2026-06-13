import { PrismaClient } from '@prisma/client'
import { startCnaAllSync } from '@/lib/sipe-scraper'

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('🚀 Iniciando sincronização CNA...\n')

    // Buscar todos os advogados com OAB
    const advogados = await prisma.sipeAdvogado.findMany({
      where: { oab: { not: null } },
    })

    console.log(`📊 Total de advogados com OAB: ${advogados.length}`)
    if (advogados.length === 0) {
      console.log('❌ Nenhum advogado com OAB cadastrado')
      return
    }

    // Criar job de sincronização
    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'ADVOGADOS_CNA',
        unidade: 'ALL',
        unidadeNome: 'CNA - Cadastro Nacional dos Advogados',
        status: 'RUNNING',
        total: advogados.length,
        processado: 0,
        erros: 0,
        iniciadoEm: new Date(),
        criadoPor: 'system',
        fase: 'Iniciando',
        log: `Iniciando sincronização CNA para ${advogados.length} advogados...`,
      },
    })

    console.log(`\n📋 Job ID: ${job.id}`)
    console.log(`\n⏳ Sincronização em progresso...\n`)

    // Disparar sincronização em background
    startCnaAllSync(job.id)

    // Monitorar progresso por 2 minutos
    let lastStatus = { processado: 0, erros: 0 }
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5000))

      const current = await prisma.sipeSyncJob.findUnique({ where: { id: job.id } })
      if (current && (current.processado > lastStatus.processado || current.erros > lastStatus.erros)) {
        const total = current.total || 1
        const pct = Math.round((current.processado / total) * 100)
        console.log(`[${current.processado}/${total}] ${pct}% | Erros: ${current.erros}`)
        console.log(`  Última atualização: ${current.log}\n`)
        lastStatus = { processado: current.processado, erros: current.erros }
      }

      if (current?.status !== 'RUNNING') {
        console.log(`\n✅ Sincronização ${current?.status}: ${current?.log}`)
        break
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error instanceof Error ? error.message : String(error))
  } finally {
    await prisma.$disconnect()
  }
}

main()
