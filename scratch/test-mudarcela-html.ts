import { readFileSync } from 'fs'
import * as cheerio from 'cheerio'

async function main() {
  const html = readFileSync('scratch/mudarcela-31417.html', 'utf8')
  const $ = cheerio.load(html)
  const tables = $('table')
  console.log(`Encontradas ${tables.length} tabelas no HTML.`)

  tables.each((tIdx, tableEl) => {
    const table = $(tableEl)
    console.log(`\n================ TABELA ${tIdx} ================`)
    const headers: string[] = []
    table.find('thead tr th, thead tr td, tr:first-child th, tr:first-child td').each((idx, el) => {
      const text = $(el).text().trim()
      headers.push(text)
    })
    console.log('CABEÇALHOS:', headers)

    const rows = table.find('tbody tr')
    console.log(`Linhas no tbody: ${rows.length}`)
    if (rows.length > 0) {
      console.log('Exemplo Linha 0:', $(rows.get(0)).find('td').map((_, el) => $(el).text().trim()).get())
    }
  })
}

main()
