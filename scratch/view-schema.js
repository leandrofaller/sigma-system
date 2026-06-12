const fs = require('fs');

const content = fs.readFileSync('src/lib/sipe-scraper.ts', 'utf8');
const lines = content.split('\n');

console.log('--- FUNÇÕES ASYNC NO SIPE-SCRAPER.TS ---');
console.log(lines.slice(1667, 1730).join('\n'));
