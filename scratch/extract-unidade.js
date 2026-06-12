const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('scratch/mudarcela-31417.html', 'utf8');
const $ = cheerio.load(html);

console.log('--- BUSCANDO UNIDADE PRISIONAL NO HTML ---');

console.log('Unidade input val:', $('input[name="unidade"]').val());
console.log('Unidade label text:', $('label[for="unidade"]').next().val() || $('input#unidade').val());

