const { chromium } = require('playwright');
const { prisma } = require('../src/lib/db');
const { scrapeCnaOabDetails } = require('../src/lib/sipe-scraper');

async function main() {
  console.log('Iniciando script de validação local do scraping CNA OAB...');

  // 1. Procurar ou criar um advogado de teste no banco local
  let adv = await prisma.sipeAdvogado.findFirst({
    where: {
      oab: { contains: '3092' }
    }
  });

  if (!adv) {
    console.log('Advogado de teste não encontrado no banco. Criando registro temporário...');
    adv = await prisma.sipeAdvogado.create({
      data: {
        sipeId: 999999,
        nome: 'ABDIEL AFONSO FIGUEIRA',
        oab: '3092/RO',
        cpf: '000.000.000-00',
        telefone: '6934415454'
      }
    });
  }

  console.log(`Advogado de teste no banco: ID=${adv.id}, Nome=${adv.nome}, OAB=${adv.oab}`);

  // 2. Iniciar Playwright e rodar a rotina de scrape
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR'
  });

  // Ocultar webdriver
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    console.log('Chamando scrapeCnaOabDetails...');
    await scrapeCnaOabDetails(page, adv.id, adv.oab);
    
    console.log('Verificando se o banco foi atualizado...');
    const updatedAdv = await prisma.sipeAdvogado.findUnique({
      where: { id: adv.id }
    });

    console.log('Dados após sincronização:');
    console.log(' - Telefone:', updatedAdv.telefone);
    console.log(' - Endereço:', updatedAdv.endereco);
    console.log(' - PhotoPath:', updatedAdv.photoPath);

    if (updatedAdv.photoPath) {
      console.log('✅ Sucesso! A foto foi salva e o caminho foi persistido no banco de dados.');
    } else {
      console.log('⚠️ A sincronização executou, mas nenhuma foto foi persistida (pode ter sido bloqueada por captcha na VPS ou o advogado não tem foto).');
    }

  } catch (err) {
    console.error('❌ Falha na execução do teste:', err);
  } finally {
    await browser.close();
    console.log('Script finalizado.');
  }
}

main();
