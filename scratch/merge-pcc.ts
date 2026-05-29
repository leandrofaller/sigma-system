import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== INICIANDO MESCLAGEM DE PCC (SIPE ID 8 -> SIPE ID 2) ===')

  // 1. Localizar as facções
  const faccao2 = await prisma.sipeFaccao.findUnique({
    where: { sipeId: 2 }
  })
  const faccao8 = await prisma.sipeFaccao.findUnique({
    where: { sipeId: 8 }
  })

  if (!faccao2) {
    console.error('❌ Erro: Facção com SIPE ID 2 (Primeiro Comando da Capital) não encontrada no banco.')
    return
  }

  if (!faccao8) {
    console.log('⚠️ SIPE ID 8 não encontrado no banco. Talvez já tenha sido removido.')
    return
  }

  console.log(`Facção de Destino (SIPE ID 2): CUID: ${faccao2.id} | Nome: "${faccao2.nome}"`)
  console.log(`Facção de Origem (SIPE ID 8): CUID: ${faccao8.id} | Nome: "${faccao8.nome}"`)

  // 2. Contar apenados antes da migração
  const count2 = await prisma.sipeApenadoImportado.count({
    where: { faccaoId: faccao2.id }
  })
  const count8 = await prisma.sipeApenadoImportado.count({
    where: { faccaoId: faccao8.id }
  })

  console.log(`Apenados na Destino (ID 2): ${count2}`)
  console.log(`Apenados na Origem (ID 8): ${count8}`)

  // 3. Atualizar os apenados da facção 8 para apontar para a facção 2
  const updatedCount = await prisma.sipeApenadoImportado.updateMany({
    where: { faccaoId: faccao8.id },
    data: { faccaoId: faccao2.id }
  })

  console.log(`✅ Atualizados ${updatedCount.count} apenados de SIPE ID 8 para SIPE ID 2.`)

  // 4. Apagar a facção 8
  await prisma.sipeFaccao.delete({
    where: { id: faccao8.id }
  })

  console.log(`✅ Registro órfão (SIPE ID 8) deletado com sucesso.`)

  // 5. Verificar o resultado final
  const finalCount2 = await prisma.sipeApenadoImportado.count({
    where: { faccaoId: faccao2.id }
  })
  console.log(`Apenados finais na Destino (ID 2): ${finalCount2} (esperado: ${count2 + count8})`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
