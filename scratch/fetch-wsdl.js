const http = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  const urls = [
    'https://www5.oab.org.br/Integracao/CNA.svc?wsdl',
    'https://www5.oab.org.br/cnaws/service.asmx?WSDL'
  ];

  for (const url of urls) {
    console.log(`Buscando ${url}...`);
    try {
      const res = await fetchUrl(url);
      console.log(`Status: ${res.status}`);
      console.log('Tamanho dos dados:', res.data.length);
      if (res.status === 200) {
        console.log('Amostra dos dados (primeiros 2000 chars):');
        console.log(res.data.slice(0, 2000));
      }
    } catch (err) {
      console.error(`Erro ao buscar ${url}:`, err.message);
    }
    console.log('------------------------------------------');
  }
}

main();
