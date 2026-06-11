import * as cheerio from 'cheerio'
import { readFileSync } from 'fs'
import { prisma } from '../src/lib/db'

function parseApenadoFichaHtmlCheerio(html: string) {
  const $ = cheerio.load(html)
  const val = (name: string) => $(`[name="${name}"]`).val()?.toString().trim() || null
  const selVal = (name: string) => {
    const select = $(`[name="${name}"]`)
    if (!select.length) return null
    const selectedOpt = select.find('option:selected')
    if (selectedOpt.length) {
      return selectedOpt.text().trim() || null
    }
    const valAttr = select.val()
    if (valAttr) {
      const opt = select.find(`option[value="${valAttr}"]`)
      if (opt.length) return opt.text().trim() || null
    }
    return select.find('option').first().text().trim() || null
  }
  const bodyText = $('body').text() || ''

  const extractLabel = (label: string): string | null => {
    let match = bodyText.match(new RegExp(`${label}\\s*:?\\s*([^\\n]+)`, 'i'))
    if (match) {
      const value = match[1].trim()
      if (value && value.length > 0 && !value.match(/^[\s•\-–—]+$/)) return value
    }
    match = bodyText.match(new RegExp(`${label}\\s*[\\n\\r]+\\s*([^\\n]+)`, 'i'))
    if (match) {
      const value = match[1].trim()
      if (value && value.length > 0 && !value.match(/^[\s•\-–—]+$/)) return value
    }
    return null
  }

  const sexoValue = selVal('sexo') || extractLabel('Sexo') || extractLabel('Sexo:') || extractLabel('Gênero')
  const etniaValue = selVal('fk_etnia') || extractLabel('Etnia')
  const estadoCivilValue = selVal('fk_estadocivil') || extractLabel('Estado Civil')
  const grauInstrucaoValue = selVal('fk_grauinstrucao') || extractLabel('Grau de Instrução') || extractLabel('Grau Instrução') || extractLabel('Instrução')
  const religiaoValue = selVal('fk_religiao') || extractLabel('Religião')
  const situacaoValue = selVal('situacao') || extractLabel('Situação') || extractLabel('Situação:') || extractLabel('Status')

  return {
    dados: {
      nome: val('nomeapenado'),
      nomeOutro: val('nomefalso'),
      cpf: val('cpf'),
      rg: val('rg'),
      rgOrgao: val('orgaoexpedidor'),
      dataNascimento: val('datanascimento'),
      naturalidade: val('distrito'),
      sexo: sexoValue,
      etnia: etniaValue,
      orientacaoSexual: selVal('homosexual') || extractLabel('Orientação\\s+Sexual'),
      tipoSanguineo: selVal('tiposanguineo') || extractLabel('Tipo\\s+(?:de\\s+)?Sanguíneo'),
      grauInstrucao: grauInstrucaoValue,
      religiao: religiaoValue,
      estadoCivil: estadoCivilValue,
      nomeConjuge: val('nomeesposa'),
      qtdFilhos: parseInt(val('qtdfilhos') || '0') || null,
      nomeMae: val('nomemae'),
      nomePai: val('nomepai'),
      telefone: val('telefone'),
      rji: val('rji'),
      regime: val('regime'),
      situacao: situacaoValue,
      dataEntrada: val('dataentrada'),
      dataPrisao: val('dataprisao'),
      tempoPena: val('tempodepena'),
      oficioEntrada: val('oficioentrada'),
      presoOriundo: selVal('presooriundo'),
      monitorado: val('monitorado') === 'SIM',
      intramuro: val('intramuro') === 'SIM',
      faccaoSipeId: parseInt($('[name="faccao_id"]').val()?.toString() || '0') || null,
      celaFicha: null,
      unidadeFicha: null,
    }
  }
}

async function testSync(sipeId: number, htmlPath: string) {
  console.log(`Carregando HTML do arquivo: ${htmlPath}...`)
  const html = readFileSync(htmlPath, 'utf-8')
  
  console.log('Executando parseApenadoFichaHtmlCheerio...')
  const parseResult = parseApenadoFichaHtmlCheerio(html)
  const dados = parseResult.dados

  console.log('Dados do parser (situacao jurídica na ficha):', dados.situacao)

  // AQUI IMPLEMENTAMOS A MESMA LÓGICA DE FALLBACK DO SCRAPER CORRIGIDO:
  console.log('Consultando banco de dados local para o fallback...')
  const existingApenado = await prisma.sipeApenadoImportado.findUnique({
    where: { sipeId },
    select: { situacao: true, cela: true, unidade: true }
  })
  
  console.log('Registro atual no banco antes de rodar o scraper:', {
    sipeId,
    situacao: existingApenado?.situacao,
    unidade: existingApenado?.unidade
  })

  // Lógica de fallback
  const listagemInfoCacheMock = new Map<number, { cela?: string, situacao?: string }>()
  // Simula o cache vazio (como na retomada do job)
  const cela = listagemInfoCacheMock.get(sipeId)?.cela ?? existingApenado?.cela ?? dados.celaFicha ?? null
  const situacao = listagemInfoCacheMock.get(sipeId)?.situacao ?? existingApenado?.situacao ?? dados.situacao ?? null
  const unidade = existingApenado?.unidade ?? dados.unidadeFicha ?? null

  console.log('Valores resolvidos após fallback:', {
    cela,
    situacao,
    unidade
  })

  const upsertData = {
    nome: dados.nome || 'SEM NOME',
    nomeOutro: dados.nomeOutro,
    cpf: dados.cpf,
    rg: dados.rg,
    rgOrgao: dados.rgOrgao,
    dataNascimento: dados.dataNascimento,
    naturalidade: dados.naturalidade,
    sexo: dados.sexo,
    etnia: dados.etnia,
    orientacaoSexual: dados.orientacaoSexual,
    tipoSanguineo: dados.tipoSanguineo,
    grauInstrucao: dados.grauInstrucao,
    religiao: dados.religiao,
    estadoCivil: dados.estadoCivil,
    nomeConjuge: dados.nomeConjuge,
    qtdFilhos: dados.qtdFilhos,
    nomeMae: dados.nomeMae,
    nomePai: dados.nomePai,
    telefone: dados.telefone,
    rji: dados.rji,
    regime: dados.regime,
    situacao: situacao || undefined,
    dataEntrada: dados.dataEntrada,
    dataPrisao: dados.dataPrisao,
    tempoPena: dados.tempoPena,
    monitorado: dados.monitorado,
    intramuro: dados.intramuro,
    presoOriundo: dados.presoOriundo,
    oficioEntrada: dados.oficioEntrada,
    unidade,
    cela: cela || undefined,
    ultimaSyncAt: new Date(),
  }

  console.log('Realizando update no banco local...')
  const updated = await prisma.sipeApenadoImportado.update({
    where: { sipeId },
    data: upsertData
  })

  console.log('Resultado no banco local após execução:', {
    sipeId: updated.sipeId,
    nome: updated.nome,
    situacao: updated.situacao,
    unidade: updated.unidade
  })

  if (updated.situacao === 'Preso Recambiado') {
    console.log('🎉 SUCESSO! A situação "Preso Recambiado" foi preservada!')
  } else {
    console.error('❌ FALHA! A situação foi alterada para:', updated.situacao)
  }
}

async function main() {
  try {
    await testSync(41920, 'scratch/abdiel-playwright.html')
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
