const fs = require('fs');
const cheerio = require('cheerio');

function searchInFile(filename) {
  if (!fs.existsSync(filename)) {
    console.log(`Arquivo ${filename} não existe.`);
    return;
  }
  const html = fs.readFileSync(filename, 'utf8');
  const $ = cheerio.load(html);
  
  console.log(`\n--- BUSCA EM ${filename} ---`);
  $('*').each((i, el) => {
    const tagName = el.name || el.tagName || '';
    if (!tagName || ['html', 'head', 'body', 'script', 'style', 'link', 'meta'].includes(tagName.toLowerCase())) return;

    const text = $(el).text().trim().replace(/\s+/g, ' ');
    const onclick = $(el).attr('onclick') || '';
    const href = $(el).attr('href') || '';
    const id = $(el).attr('id') || '';
    const className = $(el).attr('class') || '';

    const matchesText = /imprimir|pdf|relatorio|ficha|print|cela|historico/i.test(text);
    const matchesOnclick = /imprimir|pdf|relatorio|print|cela|historico|window\.open/i.test(onclick);
    const matchesHref = /imprimir|pdf|relatorio|print|cela|historico/i.test(href);
    
    if (matchesText || matchesOnclick || matchesHref) {
      if (text.length > 0 && text.length < 150) {
        console.log(`[${tagName}] ID: "${id}" Class: "${className}"`);
        console.log(`  Text: "${text}"`);
        if (href) console.log(`  Href: "${href}"`);
        if (onclick) console.log(`  Onclick: "${onclick}"`);
      }
    }
  });
}

searchInFile('scratch/mudarcela-31417.html');
searchInFile('scratch/selecionar-opcao-31417.html');
searchInFile('scratch/editar-31417.html');
searchInFile('scratch/informacoes-31417.html');
