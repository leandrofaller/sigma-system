const fs = require('fs');

async function main() {
  const sipeId = 31417;
  const unitId = '3'; // CDPPVH (unidade padrão do usuário)
  
  try {
    // 1. Seleciona o apenado
    console.log('Selecionando o apenado via proxy...');
    await fetch(`http://localhost:8000/sipe/proxy?path=${encodeURIComponent(`/apenados/${sipeId}/selecionarOpcao`)}`, {
      headers: {
        'Accept': 'application/json',
        'X-Sipe-Unidade': unitId
      }
    });

    // 2. Pega a página de mudarcela para obter o CSRF token
    console.log('Obtendo CSRF token via proxy...');
    const resEdit = await fetch(`http://localhost:8000/sipe/proxy?path=${encodeURIComponent(`/apenados/${sipeId}/mudarcela`)}`, {
      headers: {
        'Accept': 'application/json',
        'X-Sipe-Unidade': unitId
      }
    });
    
    if (!resEdit.ok) {
      console.error('Falha no GET editar:', resEdit.status);
      return;
    }
    
    const editData = await resEdit.json();
    const htmlEdit = editData.html || '';
    
    const cheerio = require('cheerio');
    const $edit = cheerio.load(htmlEdit);
    const csrfToken = $edit('input[name="_token"]').val()?.toString() || $edit('meta[name="csrf-token"]').attr('content');
    
    if (!csrfToken) {
      console.error('CSRF token não encontrado no HTML!');
      return;
    }
    console.log('CSRF Token:', csrfToken);
    
    // 2. Faz o POST para fichaGeral via proxy enviando 'listar[]'
    console.log('Enviando POST fichaGeral via proxy...');
    const resFicha = await fetch('http://localhost:8000/sipe/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sipe-Unidade': unitId
      },
      body: JSON.stringify({
        path: '/relatorios/fichaGeral',
        method: 'POST',
        form: {
          _token: csrfToken,
          apenado_id: String(sipeId),
          'listar[]': ['DP', 'M']
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
    });
    
    if (!resFicha.ok) {
      console.error('Falha no POST fichaGeral:', resFicha.status);
      return;
    }
    
    const fichaData = await resFicha.json();
    const htmlFicha = fichaData.html || '';
    console.log('Status do SIPE:', resFicha.status);
    console.log('Tamanho da Ficha Geral:', htmlFicha.length, 'bytes');
    
    if (htmlFicha.includes('login') && htmlFicha.includes('password')) {
      console.log('⚠️ Redirecionado para tela de login! Sessão inválida.');
    } else {
      console.log('🎉 Ficha Geral obtida com sucesso!');
      fs.writeFileSync('scratch/ficha-geral-proxy-success.html', htmlFicha);
      console.log('Salvo em scratch/ficha-geral-proxy-success.html');
      
      const $ficha = cheerio.load(htmlFicha);
      console.log('Tabelas encontradas na Ficha Geral:', $ficha('table').length);
      $ficha('table').each((i, table) => {
        const headers = [];
        $ficha(table).find('thead tr th, thead tr td, tr:first-child th, tr:first-child td').each((_, el) => {
          headers.push($ficha(el).text().trim().replace(/\s+/g, ' '));
        });
        console.log(`  Tabela ${i}: Headers =`, headers);
      });
    }
    
  } catch (err) {
    console.error('Erro:', err);
  }
}

main();
