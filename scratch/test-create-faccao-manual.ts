import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testCreateFaccaoManual(nome: string, sigla: string, cor: string) {
  console.log(`Testando a criação manual de facção "${nome}"...`)

  // Busca o menor sipeId negativo cadastrado para gerar o próximo incremental
  const menorIdFaccao = await prisma.sipeFaccao.findFirst({
    where: { sipeId: { lt: 0 } },
    orderBy: { sipeId: 'asc' },
    select: { sipeId: true }
  })
  const sipeId = menorIdFaccao ? menorIdFaccao.sipeId - 1 : -1

  console.log(`Gerado sipeId fictício: ${sipeId}`)

  try {
    const faccao = await prisma.sipeFaccao.create({
      data: {
        sipeId,
        nome,
        sigla: sigla || null,
        cor: cor || '#ef4444',
      },
    })
    console.log(`✅ Facção manual criada com SUCESSO!`)
    console.log(`Detalhes: CUID=${faccao.id} | SIPE ID=${faccao.sipeId} | Nome=${faccao.nome} | Sigla=${faccao.sigla} | Cor=${faccao.cor}\n`)

    // Limpar após o teste
    await prisma.sipeFaccao.delete({
      where: { id: faccao.id }
    })
    console.log('🧹 Registro de teste limpo com sucesso.')
  } catch (err: any) {
    console.error('❌ ERRO ao criar facção manual:', err.message || err)
  }
}

async function main() {
  await testCreateFaccaoManual('Facção Teste Manual', 'FTM', '#ff00ff')
}

main().catch(console.error).finally(() => prisma.$disconnect())
