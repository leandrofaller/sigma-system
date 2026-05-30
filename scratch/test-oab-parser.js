const examples = ['12586', '7495', '11066', '12369', '28576/O', '3092/RO', '3092A/RO'];

for (const oabString of examples) {
  let inscricao = '';
  let uf = 'RO'; // Padrão local

  const hasSlash = oabString.includes('/');
  if (hasSlash) {
    const match = oabString.match(/(\d+)(?:-?[A-Za-z])?\/([A-Za-z]{1,2})/i);
    if (match) {
      inscricao = match[1];
      const ufParsed = match[2].toUpperCase();
      if (ufParsed === 'O' || ufParsed === 'R') {
        uf = 'RO';
      } else {
        uf = ufParsed;
      }
    }
  } else {
    const match = oabString.match(/^(\d+)/);
    if (match) {
      inscricao = match[1];
      uf = 'RO';
    }
  }

  console.log(`Input: "${oabString}" -> Inscrição: "${inscricao}", UF: "${uf}"`);
}
