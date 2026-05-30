import * as fs from 'fs'
import * as path from 'path'

const htmlPath = path.join(process.cwd(), '.debug-sipe-test', 'candidato-7441-Cônjuge_Autorizações.html')

if (!fs.existsSync(htmlPath)) {
  console.error('HTML de Cônjuge/Autorizações não encontrado!')
  process.exit(1)
}

const html = fs.readFileSync(htmlPath, 'utf-8')
const lines = html.split('\n')

console.log('--- Buscando tags <img> no HTML ---')
let imgCount = 0
lines.forEach((line, index) => {
  if (line.toLowerCase().includes('<img') || line.toLowerCase().includes('img ')) {
    console.log(`Linha ${index + 1}: ${line.trim()}`)
    imgCount++
  }
})
console.log(`Total de tags <img> encontradas: ${imgCount}`)

console.log('\n--- Buscando tabelas e suas trs/tds ---')
// Vamos imprimir as linhas próximas às tabelas para ver a estrutura
let tableOpen = false
let rowIdx = 0
lines.forEach((line, index) => {
  const l = line.trim()
  if (l.toLowerCase().includes('<table')) {
    tableOpen = true
    console.log(`\n[Tabela Iniciada na linha ${index + 1}]`)
  }
  if (tableOpen) {
    if (l.toLowerCase().includes('<tr')) {
      rowIdx++
      console.log(`  Row ${rowIdx} (Linha ${index + 1}): ${l}`)
    }
    if (l.toLowerCase().includes('<td') || l.toLowerCase().includes('<th') || l.toLowerCase().includes('img') || l.toLowerCase().includes('src=')) {
      console.log(`    Cell (Linha ${index + 1}): ${l}`)
    }
  }
  if (l.toLowerCase().includes('</table')) {
    tableOpen = false
    rowIdx = 0
    console.log(`[Tabela Finalizada na linha ${index + 1}]`)
  }
})
