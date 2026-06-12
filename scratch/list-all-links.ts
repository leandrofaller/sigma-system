import { readFileSync } from 'fs'
import * as cheerio from 'cheerio'

async function main() {
  const html = readFileSync('scratch/selecionar-opcao-31417.html', 'utf8')
  const $ = cheerio.load(html)
  
  console.log('--- TODOS OS LINKS DA PÁGINA ---')
  $('a').each((i, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    console.log(`Link ${i}: "${text}" -> "${href}"`)
  })
}

main()
