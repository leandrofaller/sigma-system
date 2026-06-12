import { prisma } from '../src/lib/db'

async function main() {
  try {
    const total = await prisma.sipeHistorico.count()
    const transferencias = await prisma.sipeHistorico.count({ where: { tipo: 'TRANSFERENCIA' } })
    const movimentacoes = await prisma.sipeHistorico.count({ where: { tipo: 'MOVIMENTACAO' } })

    console.log(`Total de históricos: ${total}`)
    console.log(`Total de transferências (mudança de cela): ${transferencias}`)
    console.log(`Total de movimentações: ${movimentacoes}`)

    if (movimentacoes > 0) {
      console.log('\nExemplos de Movimentações:')
      const exemplos = await prisma.sipeHistorico.findMany({
        where: { tipo: 'MOVIMENTACAO' },
        take: 5,
        include: {
          apenado: {
            select: {
              sipeId: true,
              nome: true,
              unidade: true
            }
          }
        }
      })
      exemplos.forEach((e) => {
        console.log(JSON.stringify(e, null, 2))
      })
    }
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
