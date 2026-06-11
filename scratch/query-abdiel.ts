import { prisma } from '../src/lib/db'

async function main() {
  try {
    const apenado = await prisma.sipeApenadoImportado.findFirst({
      where: {
        OR: [
          { nome: { contains: 'ABDIEL' } },
          { cpf: { contains: '022.749.762-79' } }
        ]
      }
    })
    console.log('Dados do apenado no banco local:')
    console.log(JSON.stringify(apenado, null, 2))
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
