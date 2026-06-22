import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function testFetch() {
  try {
    console.log("Realizando GET em https://sgp.sejus.ro.gov.br/login...");
    const res = await fetch("https://sgp.sejus.ro.gov.br/login", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const setCookies = res.headers.raw()['set-cookie'] || [];
    console.log("Cookies recebidos:", setCookies);

    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Verificando forms e inputs
    console.log("Forms encontrados:");
    $('form').each((i, el) => {
      console.log(`Form #${i}: Action="${$(el).attr('action')}" Method="${$(el).attr('method')}"`);
      $(el).find('input').each((j, input) => {
        console.log(`  Input: name="${$(input).attr('name')}" type="${$(input).attr('type')}" value="${$(input).attr('value')}"`);
      });
    });
  } catch (err) {
    console.error("Erro no fetch:", err);
  }
}

testFetch();
