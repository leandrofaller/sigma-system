import { chromium } from 'playwright';
import dotenv from 'dotenv';
dotenv.config();

const SIPE_URL = 'https://sipe.sejus.ro.gov.br';
const SIPE_CPF = process.env.SIPE_CPF ?? '';
const SIPE_SENHA = process.env.SIPE_SENHA ?? '';

async function main() {
  console.log(`Iniciando teste de login Playwright com CPF: ${SIPE_CPF}`);
  if (!SIPE_CPF || !SIPE_SENHA) {
    console.error('CPF ou Senha ausentes no ambiente!');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log(`Acessando ${SIPE_URL}...`);
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('Aguardando campos de formulário...');
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    
    const cpfInput = await page.$('input[placeholder*="CPF"], input[name*="cpf"], input[type="text"]');
    if (cpfInput) {
      await cpfInput.fill(SIPE_CPF);
    } else {
      console.error('Campo de CPF não encontrado!');
    }
    
    await page.fill('input[type="password"]', SIPE_SENHA);
    
    console.log('Enviando formulário...');
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    await submitBtn?.click();
    
    console.log('Aguardando redirecionamento...');
    await page.waitForTimeout(8000);
    
    const finalUrl = page.url();
    console.log("URL final após envio:", finalUrl);
    
    const bodyText = await page.innerText('body');
    console.log("Texto do body (primeiros 300 chars):", bodyText.slice(0, 300).replace(/\s+/g, ' '));
  } catch (e) {
    console.error("Erro durante o fluxo do Playwright:", e);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
