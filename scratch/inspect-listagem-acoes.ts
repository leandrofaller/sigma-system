import * as fs from 'fs'
import * as path from 'path'

const htmlPath = path.join(process.cwd(), '.debug-sipe', 'apenados-index-full.html')

if (!fs.existsSync(htmlPath)) {
  console.error('HTML da listagem de apenados não encontrado!')
  process.exit(1)
}

const html = fs.readFileSync(htmlPath, 'utf-8')

// Extrair todas as tags <a> do HTML que contêm links na tabela
// Geralmente as ações ficam dentro de <td class="..."> ou contêm ícones
// Vamos fazer um parsing rápido regex
const linkRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
let match
const links: Array<{ href: string, text: string }> = []

while ((match = linkRegex.exec(html)) !== null) {
  const href = match[1]
  const text = match[2].replace(/<[^>]*>/g, '').trim()
  if (href.includes('/7441') || href.includes('/apenados/') || href.includes('visit') || href.includes('movi') || href.includes('hist') || href.includes('visita')) {
    links.push({ href, text })
  }
}

console.log(`--- Links de ações encontrados no HTML de listagem (${links.length} itens) ---`)
// Remove duplicados para exibição limpa
const uniqueLinks = links.filter((v, i, a) => a.findIndex(t => t.href === v.href) === i)
uniqueLinks.forEach(l => {
  console.log(`Link: "${l.text}" -> href: "${l.href}"`)
})

console.log('\n--- Buscando qualquer URL contendo ID de apenado de exemplo ---')
// Vamos buscar todas as ocorrências de links que tenham um número no final (como ID de apenado)
const idLinkRegex = /href=["']([^"']*\/\d+[^"']*)["']/gi
const idLinks: string[] = []
while ((match = idLinkRegex.exec(html)) !== null) {
  idLinks.push(match[1])
}
const uniqueIdLinks = idLinks.filter((v, i, a) => a.indexOf(v) === i)
console.log(`Encontrados ${uniqueIdLinks.length} links com padrão de ID numérico:`)
uniqueIdLinks.slice(0, 30).forEach(link => {
  console.log(`  ${link}`)
})
