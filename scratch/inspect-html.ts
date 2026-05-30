import * as fs from 'fs'
import * as path from 'path'

const htmlPath = path.join(process.cwd(), '.debug-sipe-test', 'apenado-7441-editar.html')

if (!fs.existsSync(htmlPath)) {
  console.error('HTML não encontrado!')
  process.exit(1)
}

const html = fs.readFileSync(htmlPath, 'utf-8')
const lines = html.split('\n')

console.log('--- Buscando "visitante" ---')
lines.forEach((line, index) => {
  if (line.toLowerCase().includes('visitante')) {
    console.log(`Linha ${index + 1}: ${line.trim().substring(0, 150)}`)
  }
})

console.log('\n--- Buscando "movimentacao" ou "movimentacoes" ---')
lines.forEach((line, index) => {
  if (line.toLowerCase().includes('movimentacao') || line.toLowerCase().includes('movimentac') || line.toLowerCase().includes('histórico') || line.toLowerCase().includes('historico')) {
    console.log(`Linha ${index + 1}: ${line.trim().substring(0, 150)}`)
  }
})

console.log('\n--- Buscando tabelas (table) ---')
lines.forEach((line, index) => {
  if (line.toLowerCase().includes('<table') || line.toLowerCase().includes('tbody')) {
    console.log(`Linha ${index + 1}: ${line.trim().substring(0, 150)}`)
  }
})
