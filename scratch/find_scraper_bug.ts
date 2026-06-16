import * as fs from 'fs';

const filePath = './src/lib/sipe-scraper.ts';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('Total de linhas:', lines.length);

lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  if (line.includes('selectRole') || line.includes('perfil') || line.includes('unidade')) {
    if (line.includes('page.') || line.includes('await') || line.includes('select')) {
      console.log(`L${lineNum}: ${line.trim()}`);
    }
  }
});
