import { prisma } from '../src/lib/db'

async function main() {
  const faccoes = await prisma.sipeFaccao.findMany({
    orderBy: { sipeId: 'asc' }
  })
  
  console.log('--- LISTA DE FACÇÕES NO BANCO ---')
  faccoes.forEach(f => {
    console.log(`SIPE ID: ${f.sipeId} | Nome original/salvo: "${f.nome}" | Sigla: "${f.sigla}" | Cor: "${f.cor}"`)
  })

  // Vamos também contar quantos apenados estão vinculados a cada facção para ver se há muitos em "Companheiro de Facção"
  const apenadosPorFaccao = await prisma.sipeApenadoImportado.groupBy({
    by: ['faccaoId'],
    _count: { id: true }
  })

  console.log('\n--- POPULAÇÃO POR FACÇÃO NO BANCO ---')
  for (const group of apenadosPorFaccao) {
    const faccao = faccoes.find(f => f.id === group.faccaoId)
    console.log(`Facção: ${faccao ? `"${faccao.nome}" (${faccao.sigla})` : 'Sem facção/Null'} | Total de Apenados: ${group._count.id}`)
  }
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect())
