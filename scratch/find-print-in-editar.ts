import { readFileSync } from 'fs'
import * as cheerio from 'cheerio'

async function main() {
  const html = readFileSync('scratch/editar-31417.html', 'utf8')
  const $ = cheerio.load(html)
  
  // Remove o sidebar para focar no conteúdo principal
  $('#sidebar').remove()
  $('.sidebar').remove()
  $('.nav-list').remove()
  
  console.log('--- BUSCA POR IMPRESSÃO NO CONTEÚDO PRINCIPAL ---')
  $('a, button, input').each((i, el) => {
    const text = $(el).text().trim() || $(el).attr('value') || $(el).attr('title') || ''
    const href = $(el).attr('href') || ''
    const onclick = $(el).attr('onclick') || ''
    const id = $(el).attr('id') || ''
    
    if (/imprimir|pdf|relatorio|ficha|print|qualificacao/i.test(text) || 
        /imprimir|pdf|relatorio|print|qualificacao/i.test(href) || 
        /imprimir|pdf|relatorio|print|qualificacao/i.test(onclick)) {
      console.log(`Elemento ${el.tagName} ${i}: text="${text}" href="${href}" onclick="${onclick}" id="${id}"`)
    }
  })
}

main()
