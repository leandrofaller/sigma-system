import { readFileSync } from 'fs'
import * as cheerio from 'cheerio'

async function main() {
  const html = readFileSync('scratch/selecionar-opcao-31417.html', 'utf8')
  const $ = cheerio.load(html)
  
  console.log('--- BUSCA POR IMPRIMIR / PDF / REPORT ---')
  $('*').each((i, el) => {
    const text = $(el).text().trim()
    const onclick = $(el).attr('onclick')
    const href = $(el).attr('href')
    const id = $(el).attr('id')
    const className = $(el).attr('class')

    const matchesText = /imprimir|pdf|relatorio|ficha|qualificacao|geral/i.test(text)
    const matchesOnclick = /imprimir|pdf|relatorio|window\.open/i.test(onclick || '')
    const matchesHref = /imprimir|pdf|relatorio|ficha/i.test(href || '')
    const matchesIdOrClass = /imprimir|pdf|relatorio/i.test(id || '') || /imprimir|pdf|relatorio/i.test(className || '')

    if (matchesText || matchesOnclick || matchesHref || matchesIdOrClass) {
      console.log(`Elemento ${el.tagName}:`)
      if (text) console.log(`  Texto: "${text.substring(0, 100)}"`)
      if (onclick) console.log(`  Onclick: "${onclick}"`)
      if (href) console.log(`  Href: "${href}"`)
      if (id) console.log(`  Id: "${id}"`)
      if (className) console.log(`  Class: "${className}"`)
    }
  })
}

main()
