import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const faccoes = await prisma.sipeFaccao.findMany()

  console.log(`Encontradas ${faccoes.length} facções para normalizar no banco local.`)

  let atualizadas = 0
  for (const f of faccoes) {
    let nome = f.nome
    let sigla = f.sigla
    let cor = f.cor || '#ef4444'

    const nomeUpper = f.nome.toUpperCase()
    const ehCompanheiro = nomeUpper.includes('COMPANHEIRO DE FACÇÃO')
    let alterou = false

    if (
      (ehCompanheiro && (nomeUpper.includes('CV') || nomeUpper.includes('COMANDO VERMELHO'))) || 
      nomeUpper === 'CV' || 
      nomeUpper === 'COMANDO VERMELHO'
    ) {
      nome = 'Comando Vermelho'
      sigla = 'CV'
      cor = '#dc2626'
      alterou = true
    } else if (
      (ehCompanheiro && (nomeUpper.includes('PCC') || nomeUpper.includes('PRIMEIRO COMANDO DA CAPITAL'))) || 
      nomeUpper === 'PRIMEIRO COMANDO DA CAPITAL' || 
      nomeUpper === 'PCC'
    ) {
      nome = 'Primeiro Comando da Capital'
      sigla = 'PCC'
      cor = '#1d4ed8'
      alterou = true
    } else if (nomeUpper.includes('FAMÍLIA DO NORTE') || nomeUpper === 'FDN') {
      nome = 'Família do Norte'
      sigla = 'FDN'
      cor = '#15803d'
      alterou = true
    } else if (nomeUpper.includes('PRIMEIRO COMANDO DO PANDA') || nomeUpper === 'PCP') {
      nome = 'Primeiro Comando do Panda'
      sigla = 'PCP'
      cor = '#b45309'
      alterou = true
    } else if (nomeUpper.includes('BONDE DOS 13') || nomeUpper === 'B13') {
      nome = 'Bonde dos 13'
      sigla = 'B13'
      cor = '#4338ca'
      alterou = true
    } else if (nomeUpper.includes('COMANDO CLASSE A') || nomeUpper === 'CCA') {
      nome = 'Comando Classe A'
      sigla = 'CCA'
      cor = '#6d28d9'
      alterou = true
    } else if (ehCompanheiro || nomeUpper === 'CF') {
      nome = 'Companheiro de Facção'
      sigla = 'CF'
      cor = '#4b5563'
      alterou = true
    }

    if (alterou || f.sigla !== sigla || f.cor !== cor) {
      await prisma.sipeFaccao.update({
        where: { id: f.id },
        data: { nome, sigla, cor }
      })
      console.log(`Normalizada: "${f.nome}" (ID SIPE: ${f.sipeId}) ➔ "${nome}" (${sigla || 'Sem sigla'}) com cor ${cor}`)
      atualizadas++
    }
  }

  console.log(`\nConcluído! ${atualizadas} facções atualizadas com sucesso.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
