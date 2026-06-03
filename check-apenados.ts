import { prisma } from '@/lib/db'

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
      
      const sample = await prisma.sipeApenadoImportado.findFirst()
      if (sample) {
        console.log(`Exemplo:`, {
          sipeId: sample.sipeId,
          nome: sample.nome,
          sexo: sample.sexo,
          unidade: sample.unidade
        })
      }
    }
  } catch (e) {
    console.error('Erro:', e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
