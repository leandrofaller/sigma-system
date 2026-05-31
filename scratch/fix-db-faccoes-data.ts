import { prisma } from '../src/lib/db'

async function main() {
  console.log('🔍 Iniciando correção de facções e apenados...')

  // 1. Localiza a facção "Comando Vermelho" (SIPE ID 9)
  const faccaoCV = await prisma.sipeFaccao.findUnique({
    where: { sipeId: 9 }
  })

  if (!faccaoCV) {
    console.error('❌ Erro: Facção Comando Vermelho (SIPE ID 9) não foi encontrada no banco de dados.')
    return
  }

  // 2. Localiza a facção "Companheiro de Facção" (SIPE ID 7)
  const faccaoCF7 = await prisma.sipeFaccao.findUnique({
    where: { sipeId: 7 }
  })

  if (!faccaoCF7) {
    console.log('ℹ️ Facção Companheiro de Facção (SIPE ID 7) já não existe ou já foi apagada.')
  } else {
    // 3. Conta apenados vinculados ao SIPE ID 7
    const apenadosVinculados = await prisma.sipeApenadoImportado.findMany({
      where: { faccaoId: faccaoCF7.id }
    })

    console.log(`📊 Encontrados ${apenadosVinculados.length} apenados vinculados ao SIPE ID 7 (Companheiro de Facção).`)

    if (apenadosVinculados.length > 0) {
      // 4. Redireciona apenados do SIPE ID 7 para o SIPE ID 9 (Comando Vermelho)
      const updateResult = await prisma.sipeApenadoImportado.updateMany({
        where: { faccaoId: faccaoCF7.id },
        data: { faccaoId: faccaoCV.id }
      })
      console.log(`✅ ${updateResult.count} apenados foram migrados com sucesso para a facção "Comando Vermelho".`)
    }

    // 5. Apaga a facção de SIPE ID 7
    await prisma.sipeFaccao.delete({
      where: { id: faccaoCF7.id }
    })
    console.log('🗑️ Facção antiga "Companheiro de Facção" (SIPE ID 7) foi excluída do banco de dados.')
  }

  // 6. Opcional: Remover facção de SIPE ID 8 se existir de testes ou scrapes antigos para recriação limpa
  const faccaoCF8 = await prisma.sipeFaccao.findUnique({
    where: { sipeId: 8 }
  })
  if (faccaoCF8) {
    // Conta se há algum apenado nela (teoricamente não, mas preventivo)
    const countApenados8 = await prisma.sipeApenadoImportado.count({
      where: { faccaoId: faccaoCF8.id }
    })
    if (countApenados8 > 0) {
      console.log(`⚠️ Atenção: Há ${countApenados8} apenados vinculados ao SIPE ID 8. Removendo referências (deixando null para re-sincronizar)...`)
      await prisma.sipeApenadoImportado.updateMany({
        where: { faccaoId: faccaoCF8.id },
        data: { faccaoId: null }
      })
    }
    await prisma.sipeFaccao.delete({
      where: { id: faccaoCF8.id }
    })
    console.log('🗑️ Facção de SIPE ID 8 excluída para permitir re-sincronização limpa.')
  }

  console.log('\n🎉 Correção finalizada com sucesso!')
}

main()
  .catch(err => console.error('❌ Ocorreu um erro no script:', err))
  .finally(() => prisma.$disconnect())
