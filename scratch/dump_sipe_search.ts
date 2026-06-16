import { chromium } from 'playwright';
import * as fs from 'fs';
import * as cheerio from 'cheerio';

// Obter dados de login do .env (carregados automaticamente em next.js, mas aqui fazemos manual se necessário)
import dotenv from 'dotenv';
dotenv.config();

const SIPE_URL = 'https://sipe.sejus.ro.gov.br';
const SIPE_CPF = process.env.SIPE_CPF || '';
const SIPE_SENHA = process.env.SIPE_SENHA || '';
const SIPE_PERFIL = process.env.SIPE_PERFIL || '2';
const SIPE_UNIDADE = process.env.SIPE_UNIDADE || '3';

async function dump() {
  console.log('Iniciando dump do SIPE...');
  console.log('CPF:', SIPE_CPF);
  console.log('Unidade Inicial:', SIPE_UNIDADE);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navegando para o login...');
    await page.goto(`${SIPE_URL}/login`);
    
    // Preenche login
    await page.fill('input[name="cpf"]', SIPE_CPF);
    await page.fill('input[name="password"]', SIPE_SENHA);
    await page.click('button[type="submit"]');
    
    await page.waitForURL(url => url.includes('/selectRole') || url.includes('/dashboard') || url.includes('/index'), { timeout: 30000 });
    console.log('Login efetuado, URL atual:', page.url());

    if (page.url().includes('/selectRole')) {
      console.log('Selecionando papel/perfil...');
      await page.selectOption('select[name="perfil"]', SIPE_PERFIL);
      await page.selectOption('select[name="unidade"]', SIPE_UNIDADE);
      await page.click('button[type="submit"]');
      await page.waitForURL(url => url.includes('/dashboard') || url.includes('/index'), { timeout: 30000 });
      console.log('Papel selecionado, URL atual:', page.url());
    }

    const sipeId = 37894;
    const searchUrl = `${SIPE_URL}/apenados/index?escolha=nomeapenado&parametro=${sipeId}`;
    console.log('Buscando apenado no index:', searchUrl);
    
    await page.goto(searchUrl);
    await page.waitForSelector('table', { timeout: 15000 });
    
    const html = await page.content();
    fs.writeFileSync('./scratch/search_table.html', html);
    console.log('HTML da listagem salvo em scratch/search_table.html');

    const $ = cheerio.load(html);
    const table = $('table');
    if (!table.length) {
      console.log('Tabela não encontrada no HTML!');
      return;
    }

    console.log('\nTítulos do THEAD:');
    table.find('thead tr th, thead tr td').each((i, el) => {
      console.log(`Col ${i}: "${$(el).text().trim()}"`);
    });

    console.log('\nLinhas do TBODY:');
    table.find('tbody tr').each((rIdx, row) => {
      console.log(`\nLinha ${rIdx}:`);
      $(row).find('td').each((cIdx, td) => {
        const text = $(td).text().trim();
        const innerHtml = $(td).html()?.trim();
        console.log(`  Col ${cIdx}: Text="${text}" | HTML="${innerHtml?.substring(0, 200)}"`);
      });
    });

  } catch (error) {
    console.error('Erro no dump:', error);
  } finally {
    await browser.close();
  }
}

dump();
