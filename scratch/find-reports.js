const fs = require('fs');
const cheerio = require('cheerio');

function searchAllLinks(filename) {
  if (!fs.existsSync(filename)) return;
  const html = fs.readFileSync(filename, 'utf8');
  const $ = cheerio.load(html);
  
  console.log(`\n=== LINKS EM ${filename} ===`);
  $('a').each((i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    const onclick = $(el).attr('onclick') || '';
    
    // Se o href ou texto ou onclick contém cela ou historico ou relatorio ou imprimir ou mundaça
    if (/cela|historico|relat|imprim|mudan|print/i.test(href) || 
        /cela|historico|relat|imprim|mudan|print/i.test(text) ||
        /cela|historico|relat|imprim|mudan|print/i.test(onclick)) {
      console.log(`Text: "${text}" | Href: "${href}" | Onclick: "${onclick}"`);
    }
  });
}

searchAllLinks('scratch/selecionar-opcao-31417.html');
searchAllLinks('scratch/editar-31417.html');
searchAllLinks('scratch/informacoes-31417.html');
searchAllLinks('scratch/mudarcela-31417.html');
