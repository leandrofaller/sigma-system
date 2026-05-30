const fs = require('fs')
const path = require('path')

const htmlPath = path.join(__dirname, 'endereco-page.html')
if (!fs.existsSync(htmlPath)) {
  console.error('Arquivo endereco-page.html não encontrado!')
  return
}

const html = fs.readFileSync(htmlPath, 'utf-8')
const lines = html.split('\n')

console.log('=== Ocorrências de "19651" no HTML de Endereço ===')
lines.forEach((line, idx) => {
  if (line.includes('19651')) {
    console.log(`Linha ${idx + 1}: ${line.trim().substring(0, 200)}`)
  }
})
