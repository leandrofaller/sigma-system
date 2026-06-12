import { readFileSync } from 'fs'
import * as cheerio from 'cheerio'
import { createHash } from 'crypto'

function simulateParseAndSave(html: string, apenadoId: string) {
  const $ = cheerio.load(html)
  const table = $('table').first()
  if (!table.length) {
    console.log('Tabela não encontrada!')
    return
  }

  // Obtém a unidade prisional do formulário de dados no topo da página
  const unidadeForm = $('input[name="unidade"]').val()?.toString().trim() || ''
  console.log('Unidade Form detectada:', unidadeForm)

  // Detecção dinâmica das colunas
  let unidadeIndex = -1
  let dataIndex = -1
  let celaDeIndex = -1
  let celaParaIndex = -1
  let motivoIndex = -1

  table.find('thead tr th, thead tr td, tr:first-child th, tr:first-child td').each((idx, el) => {
    const text = $(el).text().toUpperCase().trim()
    if (text.includes('UNIDADE') || text.includes('ESTABELECIMENTO')) unidadeIndex = idx
    if (text.includes('DATA')) {
      if (!text.includes('CELA') && !text.includes('MOTIVO')) dataIndex = idx
    }
    if (text.includes('CELA DE') || text.includes('CELA ORIGEM') || (text.includes('CELA') && text.includes('DE'))) celaDeIndex = idx
    if (text.includes('CELA PARA') || text.includes('CELA DESTINO') || (text.includes('CELA') && text.includes('PARA'))) celaParaIndex = idx
    if (text.includes('MOTIVO')) motivoIndex = idx
  })

  // Fallback padrão se não conseguir detectar pelo cabeçalho
  if (dataIndex === -1) {
    unidadeIndex = 0
    dataIndex = 1
    celaDeIndex = 2
    celaParaIndex = 3
    motivoIndex = 4
  }

  console.log('Índices das colunas:', { unidadeIndex, dataIndex, celaDeIndex, celaParaIndex, motivoIndex })

  const rows = table.find('tbody tr')
  const results: any[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const cells = $(row).find('td')
    if (cells.length < 5) continue

    let unidadePrisional = unidadeIndex >= 0 && cells.length > unidadeIndex ? $(cells.get(unidadeIndex)).text().trim() : ''
    if (!unidadePrisional && unidadeForm) {
      unidadePrisional = unidadeForm
    }
    const dataStr = dataIndex >= 0 && cells.length > dataIndex ? $(cells.get(dataIndex)).text().trim() : ''
    const motivo = motivoIndex >= 0 && cells.length > motivoIndex ? $(cells.get(motivoIndex)).text().trim() : ''
    const celaDe = celaDeIndex >= 0 && cells.length > celaDeIndex ? $(cells.get(celaDeIndex)).text().trim() : ''
    const celaPara = celaParaIndex >= 0 && cells.length > celaParaIndex ? $(cells.get(celaParaIndex)).text().trim() : ''

    if (!dataStr) continue

    const tipo = 'TRANSFERENCIA'
    const partsDesc = []
    if (unidadePrisional) partsDesc.push(`Unidade: ${unidadePrisional}`)
    partsDesc.push(`De: ${celaDe}`)
    partsDesc.push(`Para: ${celaPara}`)
    if (motivo) partsDesc.push(`Motivo: ${motivo}`)
    const descricao = `Mudança de cela. ${partsDesc.join(' | ')}`

    const idString = `${apenadoId}-${tipo}-${dataStr}-${descricao}`
    const hashId = createHash('md5').update(idString).digest('hex')

    results.push({
      id: hashId,
      apenadoId,
      tipo,
      descricao,
      cela: celaPara,
      unidade: unidadePrisional || null,
    })
  }

  console.log(`\nProcessadas ${results.length} linhas de mudança de cela:`)
  results.forEach((res, idx) => {
    console.log(`Linha ${idx}:`)
    console.log(`  Unidade: "${res.unidade}"`)
    console.log(`  Descrição: "${res.descricao}"`)
  })
}

const html = readFileSync('scratch/mudarcela-31417.html', 'utf-8')
simulateParseAndSave(html, '31417')
