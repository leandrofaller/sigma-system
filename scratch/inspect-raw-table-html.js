const fs = require('fs')
const path = require('path')

const htmlPath = path.join(__dirname, 'ficha-geral-post-real.html')
if (!fs.existsSync(htmlPath)) {
  console.error('Arquivo ficha-geral-post-real.html não encontrado!')
  return
}

const html = fs.readFileSync(htmlPath, 'utf-8')

// Encontra a primeira tabela no HTML e imprime os primeiros 4000 caracteres
const tableMatch = html.match(/<table[\s\S]*?<\/table>/i)
if (tableMatch) {
  console.log('=== HTML cru da Tabela ===')
  console.log(tableMatch[0].substring(0, 4000))
  if (tableMatch[0].length > 4000) {
    console.log('... [TRUNCADO] ...')
    console.log(tableMatch[0].substring(tableMatch[0].length - 1500))
  }
} else {
  console.log('Nenhuma tabela encontrada no HTML!')
}
