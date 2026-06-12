import { readFileSync } from 'fs'
import * as cheerio from 'cheerio'

async function main() {
  const html = readFileSync('scratch/mudarcela-31417.html', 'utf8')
  const $ = cheerio.load(html)
  
  console.log('--- TODOS OS LINKS (A HREFS) ---')
  $('a').each((i, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (href) {
      console.log(`Link ${i}: "${text}" -> "${href}"`)
    }
  })

  console.log('\n--- TODOS OS BOTÕES / FORMS ---')
  $('form').each((i, el) => {
    const action = $(el).attr('action')
    console.log(`Form ${i}: action="${action}"`)
  })
}

main()
