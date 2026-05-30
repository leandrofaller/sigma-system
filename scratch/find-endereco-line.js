const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'lib', 'sipe-scraper.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

let startLine = -1;
let endLine = -1;

lines.forEach((line, idx) => {
  if (line.includes('async function scrapeEndereço') || line.includes('async function scrapeEndereco')) {
    startLine = idx;
    console.log(`Função scrapeEndereço declarada na linha ${idx + 1}`);
  }
  if (startLine !== -1 && idx > startLine && endLine === -1) {
    if (line.trim().startsWith('async function ') || line.trim().startsWith('export async function ') || line.trim().startsWith('function ')) {
      endLine = idx - 1;
    }
  }
});

if (startLine !== -1) {
  console.log(`Exibindo linhas de ${startLine + 1} a ${endLine + 1}:`);
  for (let i = startLine; i <= endLine; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
} else {
  console.log('Função não encontrada');
}
