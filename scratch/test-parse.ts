import * as cheerio from 'cheerio'
import { readFileSync } from 'fs'

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
      if (value && value.length > 0 && !value.match(/^[\s•\-–—]+$/)) {
        return value
      }
    }
    match = bodyText.match(new RegExp(`${label}\\s*[\\n\\r]+\\s*([^\\n]+)`, 'i'))
    if (match) {
      const value = match[1].trim()
      if (value && value.length > 0 && !value.match(/^[\s•\-–—]+$/)) {
        return value
      }
    }
    return null
  }

  const sexoValue = selVal('sexo') || extractLabel('Sexo') || extractLabel('Sexo:') || extractLabel('Gênero')
  const etniaValue = selVal('fk_etnia') || extractLabel('Etnia')
  const estadoCivilValue = selVal('fk_estadocivil') || extractLabel('Estado Civil')
  const grauInstrucaoValue = selVal('fk_grauinstrucao') || extractLabel('Grau de Instrução') || extractLabel('Grau Instrução') || extractLabel('Instrução')
  const religiaoValue = selVal('fk_religiao') || extractLabel('Religião')
  const situacaoValue = selVal('situacao') || extractLabel('Situação') || extractLabel('Situação:') || extractLabel('Status')

  // Vamos imprimir também como estão os elementos no HTML!
  console.log('--- Diagnóstico de Elementos no HTML ---')
  console.log(`Select sexo length:`, $('[name="sexo"]').length)
  if ($('[name="sexo"]').length) {
    console.log(`Select sexo outerHTML:`, $.html($('[name="sexo"]').first()))
  }
  console.log(`Select situacao length:`, $('[name="situacao"]').length)
  if ($('[name="situacao"]').length) {
    console.log(`Select situacao outerHTML:`, $.html($('[name="situacao"]').first()))
  }
  console.log(`Input nomemae length:`, $('[name="nomemae"]').length)
  if ($('[name="nomemae"]').length) {
    console.log(`Input nomemae value:`, $('[name="nomemae"]').val())
  }
  console.log(`Input rji length:`, $('[name="rji"]').length)
  if ($('[name="rji"]').length) {
    console.log(`Input rji value:`, $('[name="rji"]').val())
  }

  // Verificar se existem outros elementos com a classe badge ou label
  console.log('--- Badges e Labels ---')
  $('.badge, .label, span[class*="badge"], span[class*="label"]').each((i, el) => {
    console.log(`Badge ${i}: class="${$(el).attr('class')}" text="${$(el).text().trim()}"`)
  })

  // Mostrar trechos do body text perto de "Situação"
  console.log('--- Trechos com Situação ---')
  const lines = bodyText.split('\n')
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('situaç') || line.toLowerCase().includes('status')) {
      console.log(`L${idx}: ${line.trim()}`)
      // Mostrar 3 linhas antes e depois
      for (let offset = -3; offset <= 3; offset++) {
        if (offset === 0) continue
        const lNum = idx + offset
        if (lNum >= 0 && lNum < lines.length) {
          console.log(`   L${lNum}: ${lines[lNum].trim()}`)
        }
      }
    }
  })

  return {
    dados: {
      nome: val('nomeapenado'),
      cpf: val('cpf'),
      rg: val('rg'),
      dataNascimento: val('datanascimento'),
      sexo: sexoValue,
      etnia: etniaValue,
      grauInstrucao: grauInstrucaoValue,
      religiao: religiaoValue,
      estadoCivil: estadoCivilValue,
      situacao: situacaoValue,
      nomeMae: val('nomemae'),
      nomePai: val('nomepai'),
      rji: val('rji'),
      regime: val('regime'),
    }
  }
}

const html = readFileSync('scratch/abdiel-playwright.html', 'utf-8')
const res = parseApenadoFichaHtmlCheerio(html)
console.log('--- Resultado do Parse ---')
console.log(res.dados)
