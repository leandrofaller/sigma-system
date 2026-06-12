import { readFileSync } from 'fs'
import * as cheerio from 'cheerio'

async function main() {
  const html = readFileSync('scratch/editar-31417.html', 'utf8')
  const $ = cheerio.load(html)
  
  const meta = $('meta[name="csrf-token"]').attr('content')
  console.log(`Meta csrf-token: "${meta}"`)
  
  const tokenInput = $('input[name="_token"]').val()
  console.log(`Input _token: "${tokenInput}"`)
  
  // Imprime todos os inputs hidden
  console.log('\n--- Hiddens ---')
  $('input[type="hidden"]').each((i, el) => {
    console.log(`Hidden ${i}: name="${$(el).attr('name')}" value="${$(el).attr('value')}"`)
  })
}

main()
