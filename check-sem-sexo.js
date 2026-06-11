const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    const semSexo = await prisma.sipeApenadoImportado.findMany({
      where: { sexo: null },
      take: 20,
      select: {
        sipeId: true,
        nome: true,
        unidade: true,
        situacao: true,
        ultimaSyncAt: true
      }
    })
    console.log('Amostra de apenados sem sexo:')
    console.log(semSexo)
  } catch (e) {
    console.error('Erro:', e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
