const http = require('https');

function sendSoapRequest(url, soapAction, body) {
  return new Promise((resolve) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': soapAction,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message });
    });

    req.write(body);
    req.end();
  });
}

async function main() {
  const url = 'https://www5.oab.org.br/cnaws/service.asmx';
  const soapAction = 'http://tempuri.org/ConsultaAdvogado';
  
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ConsultaAdvogado xmlns="http://tempuri.org/">
      <inscricao>3092</inscricao>
      <uf>RO</uf>
      <nome></nome>
    </ConsultaAdvogado>
  </soap:Body>
</soap:Envelope>`;

  console.log('Enviando request SOAP para:', url);
  const res = await sendSoapRequest(url, soapAction, body);
  console.log('Status da Resposta:', res.status);
  console.log('Corpo da Resposta:\n', res.data);
}

main();
