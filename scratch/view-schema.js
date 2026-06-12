const fs = require('fs');

const content = fs.readFileSync('src/lib/sipe-scraper.ts', 'utf8');
const lines = content.split('\n');

console.log('--- FUNÇÕES ASYNC NO SIPE-SCRAPER.TS ---');
lines.forEach((line, idx) => {
  if (line.includes('prisma') && line.includes('import')) {
    console.log(`Linha ${idx + 1}: ${line.trim()}`);
  }
});
