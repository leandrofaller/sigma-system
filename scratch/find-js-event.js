const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', '.debug-sipe', 'apenados-index-full.html');
if (!fs.existsSync(htmlPath)) {
  console.error('Arquivo apenados-index-full.html não encontrado!');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf-8');

// Busca por btnFicha nos scripts da página
const lines = html.split('\n');
console.log('--- Ocorrências de btnFicha no HTML ---');
lines.forEach((line, idx) => {
  if (line.includes('btnFicha') || line.includes('btnficha')) {
    console.log(`Linha ${idx + 1}: ${line.trim().substring(0, 160)}`);
  }
});

console.log('\n--- Extraindo trechos de <script> que mencionam btnFicha ---');
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let scriptIndex = 0;

while ((match = scriptRegex.exec(html)) !== null) {
  scriptIndex++;
  const scriptContent = match[1];
  if (scriptContent.toLowerCase().includes('btnficha')) {
    console.log(`\nScript #${scriptIndex} (Contém btnFicha):`);
    console.log(scriptContent);
  }
}
