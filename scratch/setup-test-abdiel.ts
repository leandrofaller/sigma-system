import { prisma } from '../src/lib/db'

async function main() {
  try {
    const sipeId = 41920
    const updated = await prisma.sipeApenadoImportado.update({
      where: { sipeId },
      data: {
        situacao: 'Preso Recambiado'
      }
    })
    console.log('Situação do Abdiel definida para o teste:', updated.situacao)
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
