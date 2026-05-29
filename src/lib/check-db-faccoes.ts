import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkDB() {
  try {
    // Contar apenados
    const totalApenados = await prisma.sipeApenadoImportado.count()
    const comFaccao = await prisma.sipeApenadoImportado.count({
      where: { faccaoId: { not: null } }
    })
    const semFaccao = totalApenados - comFaccao

    console.log('\n═══════════════════════════════════════════════════════════════')
    console.log('📊 APENADOS NO BANCO DE DADOS')
    console.log('═══════════════════════════════════════════════════════════════\n')

    console.log(`Total de apenados: ${totalApenados}`)
    console.log(`Com facção: ${comFaccao}`)
    console.log(`Sem facção: ${semFaccao}`)

    // Listar facções
    const faccoes = await prisma.sipeFaccao.findMany()
    console.log(`\n📋 FACÇÕES CADASTRADAS (${faccoes.length}):`)
    for (const f of faccoes) {
      const count = await prisma.sipeApenadoImportado.count({
        where: { faccaoId: f.id }
      })
      console.log(`  - ${f.sigla || 'SEM SIGLA'} (${f.nome}) → ${count} apenados`)
    }

    // Mostrar alguns apenados com facção
    if (comFaccao > 0) {
      const apenadosComFaccao = await prisma.sipeApenadoImportado.findMany({
        where: { faccaoId: { not: null } },
        include: { faccao: true },
        take: 5
      })
      console.log(`\n✅ Exemplos de apenados com facção:`)
      for (const a of apenadosComFaccao) {
        console.log(`  - ${a.nome} → ${a.faccao?.nome}`)
      }
    }

  } catch (err) {
    console.error('Erro:', err)
  } finally {
    await prisma.$disconnect()
  }
}

checkDB()
