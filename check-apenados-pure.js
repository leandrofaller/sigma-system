const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    const count = await prisma.sipeApenadoImportado.count()
    console.log(`Total de apenados importados: ${count}`)
    
    if (count > 0) {
      const comSexo = await prisma.sipeApenadoImportado.count({
        where: { sexo: { not: null } }
      })
      console.log(`Apenados com sexo: ${comSexo}`)
      
      const semSexo = count - comSexo
      console.log(`Apenados sem sexo: ${semSexo}`)

      // Contagem por unidade
      const unidades = await prisma.sipeApenadoImportado.groupBy({
        by: ['unidade'],
        _count: { id: true }
      })
      console.log('Distribuição por unidade no banco:')
      console.log(unidades)
      
      const sample = await prisma.sipeApenadoImportado.findFirst({
        where: { unidade: 'Todas as Unidades (Global)' }
      })
      if (sample) {
        console.log(`Exemplo de Global:`, {
          sipeId: sample.sipeId,
          nome: sample.nome,
          sexo: sample.sexo,
          unidade: sample.unidade
        })
      } else {
        const anySample = await prisma.sipeApenadoImportado.findFirst()
        if (anySample) {
          console.log(`Exemplo Geral (Sem Global):`, {
            sipeId: anySample.sipeId,
            nome: anySample.nome,
            sexo: anySample.sexo,
            unidade: anySample.unidade
          })
        }
      }
    }
  } catch (e) {
    console.error('Erro:', e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
