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

    // 4. Apenados com faccaoSipeId preenchido
    const com_facacao_sipe_id = await prisma.sipeApenadoImportado.findMany({
      where: { faccaoSipeId: { not: null, not: 0 } },
      select: { id: true, nome: true, faccaoSipeId: true }
    })
    console.log(`\n4️⃣ Apenados com faccaoSipeId preenchido: ${com_facacao_sipe_id.length}`)
    if (com_facacao_sipe_id.length > 0) {
      for (const a of com_facacao_sipe_id.slice(0, 10)) {
        console.log(`   ✓ ID SIPE: ${a.faccaoSipeId} → ${a.nome?.substring(0, 40)}`)
      }
    }

    // 5. Verificar unidades prisionais
    const unidades = await prisma.sipePrisaoUnidade.findMany()
    console.log(`\n5️⃣ Unidades prisionais: ${unidades.length}`)
    if (unidades.length > 0) {
      for (const u of unidades.slice(0, 5)) {
        console.log(`   ✓ ${u.nome} (ID: ${u.unidadeId})`)
      }
    }

    // 6. Últimas sincronizações
    const jobs = await prisma.sipeSyncJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, status: true, createdAt: true, totalApenados: true }
    })
    console.log(`\n6️⃣ Últimas sincronizações:`)
    for (const job of jobs) {
      const statusEmoji = job.status === 'completed' ? '✅' : job.status === 'pending' ? '⏳' : '❌'
      console.log(`   ${statusEmoji} ${job.createdAt.toLocaleString()} - ${job.totalApenados} apenados`)
    }

    console.log('\n═════════════════════════════════════════════════════════════\n')

  } catch (err) {
    console.error('❌ ERRO:', err)
  } finally {
    await prisma.$disconnect()
  }
}

checkDatabase().catch(console.error)
