import { chromium } from 'playwright';
import { prisma } from '../src/lib/db';
import { scrapeCnaOabDetails } from '../src/lib/sipe-scraper';

async function main() {
  console.log('Iniciando script de validação local do scraping CNA OAB em TypeScript...');

  try {
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

    console.log('Primeira chamada (esperado: erro de CAPTCHA)...');
    try {
      await scrapeCnaOabDetails(page, adv.id, adv.oab as string);
    } catch (cnaErr) {
      console.log('Primeira chamada falhou como esperado por CAPTCHA:', (cnaErr as any).message);
    }

    console.log('\nSegunda chamada imediata (esperado: retorno instantâneo devido ao cooldown)...');
    const t0 = Date.now();
    await scrapeCnaOabDetails(page, adv.id, adv.oab as string);
    const duration = Date.now() - t0;
    console.log(`Segunda chamada concluída em ${duration}ms!`);

    if (duration < 500) {
      console.log('✅ Cooldown testado com sucesso! A segunda chamada foi pulada instantaneamente.');
    } else {
      console.log('❌ Falha: A segunda chamada demorou demais, o cooldown não parece estar ativo.');
    }

    await browser.close();
  } catch (err) {
    console.error('❌ Falha na execução do teste:', err);
  } finally {
    console.log('Script finalizado.');
  }
}

main();
