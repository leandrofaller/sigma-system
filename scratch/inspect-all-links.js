const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', '.debug-sipe', 'apenados-index-full.html');
if (!fs.existsSync(htmlPath)) {
  console.error('Arquivo apenados-index-full.html não encontrado!');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf-8');

// Regex para encontrar links e seus atributos
const linkRegex = /<a\s+([^>]*href=["']([^"']*)["'][^>]*)>([\s\S]*?)<\/a>/gi;
let match;
const links = [];

while ((match = linkRegex.exec(html)) !== null) {
  const fullTag = match[0];
  const href = match[2];
  const text = match[3].replace(/<[^>]*>/g, '').trim();
  links.push({ href, text, tag: fullTag.substring(0, 150) });
}

console.log(`Total de links encontrados: ${links.length}`);
console.log('\n--- Links que parecem de relatórios ou ações na tabela ---');
links.forEach(l => {
  // Mostra links que não sejam os de menu padrão que já conhecemos
  const isMenu = l.href.includes('/home') || l.href.includes('/index') || l.href.includes('/localizacao') || l.href.includes('/transferencias') || l.href.includes('/relatorios/busca') || l.href.includes('/relatorios/cadastrosUnidades') || l.href.includes('/relatorios/movimentacoesAdmin') || l.href.includes('/listagem/');
  
  if (!isMenu && l.href !== '#' && !l.href.includes('logout') && !l.href.includes('password') && !l.href.includes('configuracoes')) {
    console.log(`Text: "${l.text}" | Href: "${l.href}" | Tag: ${l.tag}...`);
  }
});
