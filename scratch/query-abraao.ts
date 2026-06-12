import { prisma } from '../src/lib/db'

async function main() {
  try {
    const apenado = await prisma.sipeApenadoImportado.findFirst({
      where: {
        OR: [
          { sipeId: 31417 },
          { nome: { contains: 'ABRAÃO DE ALMEIDA' } }
        ]
      }
    })
    
    if (!apenado) {
      console.log('Apenado ABRAÃO DE ALMEIDA (31417) não encontrado no banco.')
      return
    }

    console.log('Dados do apenado ABRAÃO DE ALMEIDA:')
    console.log(JSON.stringify({
      id: apenado.id,
      sipeId: apenado.sipeId,
      nome: apenado.nome,
      unidade: apenado.unidade,
      cela: apenado.cela
    }, null, 2))

    const historicos = await prisma.sipeHistorico.findMany({
      where: {
        apenadoId: apenado.id
      },
      orderBy: {
        datahora: 'desc'
      }
    })

    console.log(`\nHistóricos encontrados (${historicos.length}):`)
    historicos.forEach((h) => {
      console.log(JSON.stringify({
        id: h.id,
        tipo: h.tipo,
        datahora: h.datahora,
        unidade: h.unidade,
        cela: h.cela,
        descricao: h.descricao
      }, null, 2))
    })

  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
