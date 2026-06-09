import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('Iniciando teste do parser DOM de advogados (corrigido com IIFE)...');

  const htmlPath = join(__dirname, 'advogado-detalhe.html');
  const htmlContent = readFileSync(htmlPath, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Define o conteúdo HTML diretamente na página para teste
  await page.setContent(htmlContent);

  console.log('HTML carregado. Rodando o parser do advogado...');

  // Executa o evaluate usando IIFE (Immediately Invoked Function Expression)
  const dadosAdv = await page.evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('.profile-user-info-striped .profile-info-row'));
    const getVal = (name) => {
      const row = rows.find(r => (r.querySelector('.profile-info-name')?.textContent ?? '').toLowerCase().includes(name.toLowerCase()));
      return row ? (row.querySelector('.profile-info-value')?.textContent ?? '').trim() : '';
    };

    const img = document.querySelector('.profile-picture img');
    const fotoSrc = img ? img.src : null;

    return {
      nome: getVal('Nome do Advogado'),
      oab: getVal('OAB'),
      cpf: getVal('CPF'),
      endereco: getVal('Endereço'),
      telefone: getVal('Telefone de Contato'),
      dataCadastro: getVal('Data de Cadastro'),
      fotoSrc
    };
  })()`) as any;

  console.log('\n--- Dados do Advogado Extraídos ---');
  console.log(JSON.stringify(dadosAdv, null, 2));

  // Validações básicas do advogado
  if (dadosAdv.nome === 'ZENILTON FELBEK DE ALMEIDA') {
    console.log('✅ Nome do advogado extraído corretamente.');
  } else {
    console.log('❌ Falha ao extrair nome do advogado.');
  }

  if (dadosAdv.oab === '8823') {
    console.log('✅ OAB do advogado extraída corretamente.');
  } else {
    console.log('❌ Falha ao extrair OAB.');
  }

  if (dadosAdv.telefone === '(69)99283-0401') {
    console.log('✅ Telefone extraído corretamente.');
  } else {
    console.log('❌ Falha ao extrair telefone.');
  }

  console.log('\nRodando o parser dos apenados atendidos...');

  const apenadosAtendidos = await page.evaluate(`(() => {
    const tabelas = Array.from(document.querySelectorAll('table#simple-table'));
    return tabelas.map(tabela => {
      const ddElements = Array.from(tabela.querySelectorAll('dd'));
      const dtElements = Array.from(tabela.querySelectorAll('dt'));
      
      const getValByDt = (label) => {
        const index = dtElements.findIndex(dt => (dt.textContent ?? '').toLowerCase().includes(label.toLowerCase()));
        return index >= 0 && ddElements[index] ? (ddElements[index].textContent ?? '').trim() : '';
      };

      const getHrefByDt = (label) => {
        const index = dtElements.findIndex(dt => (dt.textContent ?? '').toLowerCase().includes(label.toLowerCase()));
        if (index >= 0 && ddElements[index]) {
          const a = ddElements[index].querySelector('a');
          return a ? a.getAttribute('href') : null;
        }
        return null;
      };

      // Foto do Apenado
      const img = tabela.querySelector('td img');
      const fotoSrc = img ? img.src : null;

      // Situação do Vínculo
      const labelSpan = tabela.querySelector('td .profile-contact-links span.label');
      const situacao = labelSpan ? (labelSpan.textContent ?? '').trim().toUpperCase() : 'ATIVA';

      return {
        nome: getValByDt('Nome Apenado'),
        sipeIdText: getValByDt('Cpf'),
        href: getHrefByDt('Nome Apenado'),
        dataNascimento: getValByDt('Data Nascimento'),
        unidade: getValByDt('Unidade Prisional'),
        cela: getValByDt('Cela'),
        tempoPena: getValByDt('Tempo de Pena'),
        fotoSrc,
        situacao
      };
    }).filter(ap => ap.nome && (ap.sipeIdText || ap.href));
  })()`) as any[];

  console.log(`\n--- ${apenadosAtendidos.length} Apenados Atendidos Extraídos ---`);
  console.log(JSON.stringify(apenadosAtendidos.slice(0, 3), null, 2));

  // Validações básicas de apenados
  if (apenadosAtendidos.length > 0) {
    const primeiro = apenadosAtendidos[0];
    if (primeiro.nome === 'JEFFERSON DOS SANTOS OLIVEIRA') {
      console.log('✅ Nome do primeiro apenado extraído corretamente.');
    } else {
      console.log('❌ Falha ao extrair nome do primeiro apenado.');
    }

    if (primeiro.situacao === 'ATIVA') {
      console.log('✅ Situação do primeiro vínculo ("ATIVA") extraída corretamente.');
    } else {
      console.log('❌ Falha ao extrair situação do primeiro vínculo.');
    }

    if (primeiro.fotoSrc && primeiro.fotoSrc.includes('59a7839fc9d18948dee03c9cd22a8116a40a7bfb')) {
      console.log('✅ URL da foto do primeiro apenado extraída corretamente.');
    } else {
      console.log('❌ Falha ao extrair URL da foto do primeiro apenado.');
    }

    // Segundo apenado (com vínculo CANCELADO)
    if (apenadosAtendidos.length > 1) {
      const segundo = apenadosAtendidos[1];
      if (segundo.situacao === 'CANCELADA') {
        console.log('✅ Situação do segundo vínculo ("CANCELADA") extraída corretamente.');
      } else {
        console.log('❌ Falha ao extrair situação do segundo vínculo.');
      }
    }
  } else {
    console.log('❌ Nenhum apenado atendido foi extraído.');
  }

  await browser.close();
  console.log('\nTeste finalizado.');
}

main().catch(console.error);
