import { prisma } from '../src/lib/db'

async function main() {
  try {
    const extramuros = await prisma.sipeApenadoImportado.findMany({
      where: {
        unidade: null
      },
      take: 10
    })
    console.log(`Total de apenados sem unidade: ${await prisma.sipeApenadoImportado.count({ where: { unidade: null } })}`)
    console.log(`Exemplos de apenados sem unidade:`)
    console.log(extramuros.map(a => ({
      sipeId: a.sipeId,
      nome: a.nome,
      cpf: a.cpf,
      situacao: a.situacao,
      nomeMae: a.nomeMae,
      ultimaSync: a.ultimaSyncAt
    })))
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
