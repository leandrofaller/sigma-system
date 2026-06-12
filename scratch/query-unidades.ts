import { prisma } from '../src/lib/db'

async function main() {
  try {
    const units = await prisma.sipeUnidade.findMany()
    console.log('Unidades no banco de dados:')
    console.log(units.map(u => ({ id: u.id, nome: u.nome })))
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
