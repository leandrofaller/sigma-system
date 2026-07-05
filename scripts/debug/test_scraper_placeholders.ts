import { isPlaceholderPhoto } from '../../src/lib/sipe-scraper';
import * as cheerio from 'cheerio';

// Vamos simular a parte de extração de imagens de parseApenadoFichaHtmlCheerio para validar
function simulateImageExtraction(html: string) {
  const $ = cheerio.load(html);
  const imgs: { src: string; alt: string; id: string; className: string }[] = [];
  
  $('img').each((_, img) => {
    imgs.push({
      src: $(img).attr('src') || '',
      alt: $(img).attr('alt') || '',
      id: $(img).attr('id') || '',
      className: $(img).attr('class') || '',
    });
  });

  let mainSrc: string | null = null;
  const allSrcs: string[] = [];

  for (const img of imgs) {
    const src = img.src;
    const alt = img.alt.toLowerCase();
    const id = img.id.toLowerCase();
    const className = img.className.toLowerCase();
    
    if (
      !mainSrc && (
        id.includes('foto') || id.includes('profile') || id.includes('avatar') || id.includes('apenado') ||
        className.includes('foto') || className.includes('profile') || className.includes('avatar') || className.includes('apenado') ||
        alt.includes('foto') || alt.includes('profile') || alt.includes('avatar') || alt.includes('apenado') ||
        src.includes('/foto') || src.includes('/photo') || src.includes('/imagem') || src.includes('/getFoto') || src.includes('/arquivo')
      )
    ) {
      mainSrc = src;
    } else {
      allSrcs.push(src);
    }
  }

  const containerImg = $('.foto img, .foto-apenado img, .profile-image img, #foto img').first();
  if (containerImg.length) {
    mainSrc = containerImg.attr('src') || mainSrc;
  }

  // APLICA O FILTRO QUE IMPLEMENTAMOS
  if (mainSrc && isPlaceholderPhoto(mainSrc)) {
    mainSrc = null;
  }

  if (!mainSrc && imgs.length > 0) {
    const candidates = imgs.filter(img => {
      const src = img.src.toLowerCase();
      const isSystem = src.includes('logo') || src.includes('sejus') || src.includes('governo') || src.includes('brasao') || src.includes('bandeira') || src.includes('icon');
      return !isSystem && !isPlaceholderPhoto(src);
    });
    if (candidates.length > 0) {
      mainSrc = candidates[0].src;
    }
  }

  const filteredAllSrcs = allSrcs.filter(src => !isPlaceholderPhoto(src));

  return { mainSrc, allSrcs: filteredAllSrcs };
}

function runTests() {
  console.log("--- TESTANDO FILTRO DE PLACEHOLDERS DO SCRAPER ---");

  // Caso 1: Foto real válida
  const htmlReal = `
    <html>
      <body>
        <div id="foto">
          <img src="https://sipe.sejus.ro.gov.br/fotos/283921.jpg" alt="Foto do Apenado" class="foto-img" />
        </div>
      </body>
    </html>
  `;
  const resReal = simulateImageExtraction(htmlReal);
  console.log("Teste 1 (Foto Real):");
  console.log(`  mainSrc obtido: ${resReal.mainSrc}`);
  const pass1 = resReal.mainSrc === "https://sipe.sejus.ro.gov.br/fotos/283921.jpg";
  console.log(`  Resultado: ${pass1 ? '✅ PASSOU' : '❌ FALHOU'}`);

  // Caso 2: Placeholder de silhueta (sem-foto)
  const htmlPlaceholder = `
    <html>
      <body>
        <div class="foto-apenado">
          <img src="https://sipe.sejus.ro.gov.br/images/avatar.png" id="avatar" class="avatar-style" />
        </div>
      </body>
    </html>
  `;
  const resPlaceholder = simulateImageExtraction(htmlPlaceholder);
  console.log("\nTeste 2 (Placeholder avatar.png):");
  console.log(`  mainSrc obtido: ${resPlaceholder.mainSrc}`);
  const pass2 = resPlaceholder.mainSrc === null;
  console.log(`  Resultado: ${pass2 ? '✅ PASSOU (placeholder descartado)' : '❌ FALHOU (baixou o placeholder)'}`);

  // Caso 3: Placeholder com termo sem-foto
  const htmlPlaceholder2 = `
    <html>
      <body>
        <img src="https://sipe.sejus.ro.gov.br/arquivos/imagens/sem_foto.jpg" class="foto" />
      </body>
    </html>
  `;
  const resPlaceholder2 = simulateImageExtraction(htmlPlaceholder2);
  console.log("\nTeste 3 (Placeholder sem_foto.jpg):");
  console.log(`  mainSrc obtido: ${resPlaceholder2.mainSrc}`);
  const pass3 = resPlaceholder2.mainSrc === null;
  console.log(`  Resultado: ${pass3 ? '✅ PASSOU (placeholder descartado)' : '❌ FALHOU (baixou o placeholder)'}`);

  if (pass1 && pass2 && pass3) {
    console.log("\n✅ TODOS OS TESTES PASSARAM COM SUCESSO!");
  } else {
    console.log("\n❌ HOUVE FALHA NOS TESTES!");
    process.exit(1);
  }
}

runTests();
