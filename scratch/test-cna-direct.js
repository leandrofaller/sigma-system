const http = require('https');

function fetchDirect(url) {
  return new Promise((resolve) => {
    http.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://cna.oab.org.br/'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: data
        });
      });
    }).on('error', (err) => {
      resolve({ error: err.message });
    });
  });
}

async function main() {
  const url = 'https://cna.oab.org.br/cna-interno/api/advogado/search?Uf=RO&TipoInscricao=1&Inscricao=3092';
  console.log('Realizando chamada direta para a API:', url);
  const res = await fetchDirect(url);
  console.log('Status da Resposta:', res.status);
  console.log('Corpo da Resposta:', res.data);
}

main();
