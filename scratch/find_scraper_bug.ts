import * as fs from 'fs';

const filePath = './src/lib/sipe-scraper.ts';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('Total de linhas:', lines.length);

lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  if (line.includes('=== \'SITUAÇÃO\'') || line.includes('=== "SITUAÇÃO"') || line.includes('SITUAÇAO')) {
    if (line.includes('text') || line.includes('===')) {
      console.log(`L${lineNum}: ${line.trim()}`);
    }
  }
});
