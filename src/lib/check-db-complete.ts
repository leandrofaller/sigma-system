/**
 * Verifica o estado completo das facções no banco de dados
 */

import { PrismaClient } from '@prisma/client'

async function checkDatabase() {
  const prisma = new PrismaClient()

  try {
    console.log('\n═════════════════════════════════════════════════════════════')
    console.log('📊 VERIFICAÇÃO DO BANCO DE DADOS')
    console.log('═════════════════════════════════════════════════════════════\n')

    // 1. Verificar facções cadastradas
    const faccoes = await prisma.sipeFaccao.findMany()
    console.log(`1️⃣ Facções no banco: ${faccoes.length}`)
    if (faccoes.length > 0) {
      for (const f of faccoes) {
        console.log(`   ✓ ${f.nome} (ID SIPE: ${f.sipeId})`)
      }
    }

    // 2. Verificar apenados com facção
    const apenados_com_faccao = await prisma.sipeApenadoImportado.findMany({
      where: { faccaoId: { not: null } },
      include: { faccao: true }
    })
    console.log(`\n2️⃣ Apenados com facção: ${apenados_com_faccao.length}`)
    if (apenados_com_faccao.length > 0) {
      for (const a of apenados_com_faccao.slice(0, 10)) {
        console.log(`   ✓ ${a.nome?.substring(0, 40)} → ${a.faccao?.nome}`)
      }
      if (apenados_com_faccao.length > 10) {
        console.log(`   ... e mais ${apenados_com_faccao.length - 10}`)
      }
    }

    // 3. Total de apenados
    const total_apenados = await prisma.sipeApenadoImportado.count()
    console.log(`\n3️⃣ Total de apenados importados: ${total_apenados}`)

    // 4. Verificar unidades prisionais a partir dos apenados
    const unidadesRaw = await prisma.sipeApenadoImportado.groupBy({
      by: ['unidade'],
      _count: {
        _all: true
      },
      where: {
        unidade: { not: null }
      }
    })
    console.log(`\n4️⃣ Unidades prisionais distintas nos apenados: ${unidadesRaw.length}`)
    for (const u of unidadesRaw.slice(0, 5)) {
      console.log(`   ✓ ${u.unidade} (${u._count._all} apenados)`)
    }

    // 5. Últimas sincronizações
    const jobs = await prisma.sipeSyncJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, status: true, createdAt: true, total: true, processado: true }
    })
    console.log(`\n5️⃣ Últimas sincronizações:`)
    for (const job of jobs) {
      const statusEmoji = job.status === 'COMPLETED' || job.status === 'completed' ? '✅' : job.status === 'PENDING' || job.status === 'pending' ? '⏳' : '❌'
      console.log(`   ${statusEmoji} ${job.createdAt.toLocaleString()} - Total: ${job.total ?? '?'}, Processados: ${job.processado}`)
    }

    console.log('\n═════════════════════════════════════════════════════════════\n')

  } catch (err) {
    console.error('❌ ERRO:', err)
  } finally {
    await prisma.$disconnect()
  }
}

checkDatabase().catch(console.error)
