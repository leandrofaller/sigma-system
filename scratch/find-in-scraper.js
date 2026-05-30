const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'lib', 'sipe-scraper.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

const terms = ['fichaGeral', 'historico', 'moviment', 'mudarcela', 'scrape', 'visitante', 'SipeHistorico'];

console.log(`Lendo ${filePath}... Total de linhas: ${lines.length}`);

terms.forEach(term => {
  console.log(`\n🔍 Buscando por "${term}":`);
  let found = 0;
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes(term.toLowerCase())) {
      found++;
      if (found <= 20) {
        console.log(`  Linha ${idx + 1}: ${line.trim().substring(0, 120)}`);
      }
    }
  });
  if (found > 20) {
    console.log(`  ... e mais ${found - 20} ocorrências.`);
  } else if (found === 0) {
    console.log('  Nenhuma ocorrência encontrada.');
  }
});
