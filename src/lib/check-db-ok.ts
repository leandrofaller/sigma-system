import { PrismaClient } from '@prisma/client'

async function check() {
  const prisma = new PrismaClient()

  try {
    console.log('\n📊 BANCO DE DADOS\n')

    const faccoes = await prisma.sipeFaccao.findMany()
    console.log(`Facções no banco: ${faccoes.length}`)
    if (faccoes.length > 0) {
      for (const f of faccoes) console.log(`  ✓ ${f.nome}`)
    } else {
      console.log('  (nenhuma)')
    }

    const com_faccao = await prisma.sipeApenadoImportado.count({
      where: { faccaoId: { not: null } }
    })
    const total = await prisma.sipeApenadoImportado.count()
    console.log(`\nApenados com facção: ${com_faccao} de ${total}`)

    const apenados = await prisma.sipeApenadoImportado.findMany({
      where: { faccaoId: { not: null } },
      include: { faccao: true },
      take: 5
    })
    if (apenados.length > 0) {
      console.log('\nExemplos:')
      for (const a of apenados) {
        console.log(`  ✓ ${a.nome?.substring(0, 30)} → ${a.faccao?.nome}`)
      }
    }

  } catch (err) {
    console.error('❌ ERRO:', err)
  } finally {
    await prisma.$disconnect()
  }
}

check().catch(console.error)
