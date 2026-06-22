import { prisma } from './db';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { chromium } from 'playwright';
import { runServidoresIndexing } from './servidor-indexing';

export interface ServidoresSyncProgress {
  jobId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';
  fase: string;
  total: number;
  processado: number;
  erros: number;
  ultimoLog: string;
  startTime: number;
  pct: number;
  tipo?: string;
}

// Helpers para atualizar progresso no banco e na memória global
async function dbProgress(
  jobId: string,
  patch: {
    status?: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';
    fase?: string;
    processado?: number;
    erros?: number;
    total?: number;
    log?: string;
    idsColetados?: string;
    ultimoIdProcessado?: number | null;
    iniciadoEm?: Date;
    finalizadoEm?: Date;
  }
) {
  if (patch.log) {
    const current = await prisma.sipeSyncJob.findUnique({
      where: { id: jobId },
      select: { log: true }
    });

    await prisma.sipeSyncJob.update({
      where: { id: jobId },
      data: {
        ...patch,
        log: current?.log ? current.log + '\n' + patch.log : patch.log,
        ultimaAtividade: new Date(),
      },
    });
  } else {
    await prisma.sipeSyncJob.update({
      where: { id: jobId },
      data: {
        ...patch,
        ultimaAtividade: new Date(),
      },
    });
  }
}

function refreshMemory(jobId: string, patch: Partial<ServidoresSyncProgress>) {
  if (!globalThis.__sipeState || globalThis.__sipeState.jobId !== jobId) return;
  Object.assign(globalThis.__sipeState, patch);
  if (globalThis.__sipeState.total > 0) {
    globalThis.__sipeState.pct = Math.round(
      (globalThis.__sipeState.processado / globalThis.__sipeState.total) * 100
    );
  }
}

export function startServidoresSync(jobId: string): void {
  // Previne múltiplas execuções simultâneas
  if (globalThis.__sipeState?.status === 'RUNNING') return;

  globalThis.__sipeStopFlag = false;
  globalThis.__sipeState = {
    jobId,
    status: 'RUNNING',
    fase: 'Iniciando...',
    total: 0,
    processado: 0,
    erros: 0,
    ultimoLog: 'Iniciando sincronização de servidores...',
    startTime: Date.now(),
    pct: 0,
    tipo: 'SERVIDORES',
  };

  const runPromise = async () => {
    await dbProgress(jobId, {
      status: 'RUNNING',
      fase: 'Login',
      processado: 0,
      erros: 0,
      total: 0,
      ultimoIdProcessado: null,
      log: 'Iniciando Playwright para login no SGP SEJUS...',
    });

    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
      });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
      });
      const page = await context.newPage();

      // 1. Acessa Login
      const loginUrl = 'https://sgp.sejus.ro.gov.br/login';
      console.log(`[SERVIDORES SCRAPER] Navegando para ${loginUrl}...`);
      await page.goto(loginUrl, { waitUntil: 'networkidle' });

      const username = process.env.SEJUS_SGP_USER || '';
      const password = process.env.SEJUS_SGP_PASS || '';

      if (!username || !password) {
        throw new Error('Credenciais SEJUS_SGP_USER ou SEJUS_SGP_PASS não configuradas no arquivo .env.');
      }

      // Preenche CPF/Login e Senha
      const cpfInput = page.locator('input[name="cpf"], input[name="username"], input[placeholder*="CPF"], input[type="text"]').first();
      const passInput = page.locator('input[name="password"], input[name="senha"], input[type="password"]').first();
      const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Entrar")').first();

      await cpfInput.fill(username);
      await passInput.fill(password);
      await submitBtn.click();

      console.log('[SERVIDORES SCRAPER] Submetendo credenciais de login...');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});

      // 2. Seleção do perfil "SGP - Gestor"
      const gestorOption = page.locator('text="SGP - Gestor", a:has-text("SGP - Gestor"), div:has-text("SGP - Gestor")').first();
      if (await gestorOption.count() > 0) {
        console.log('[SERVIDORES SCRAPER] Perfil SGP - Gestor encontrado na tela. Clicando...');
        await gestorOption.click();
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
      } else {
        const selectElement = page.locator('select');
        if (await selectElement.count() > 0) {
          console.log('[SERVIDORES SCRAPER] Select de perfil encontrado. Escolhendo SGP - Gestor...');
          await page.selectOption('select', { label: 'SGP - Gestor' }).catch(() => {});
          const prosseguir = page.locator('button:has-text("Prosseguir"), button:has-text("Entrar"), button[type="submit"]').first();
          if (await prosseguir.count() > 0) {
            await prosseguir.click();
            await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
          }
        }
      }

      const currentUrl = page.url();
      console.log(`[SERVIDORES SCRAPER] Logado com sucesso. URL Atual: ${currentUrl}`);
      await dbProgress(jobId, {
        fase: 'Coletando IDs',
        log: 'Login efetuado com sucesso. Acessando listagem de servidores...',
      });
      refreshMemory(jobId, { fase: 'Coletando IDs', ultimoLog: 'Login efetuado com sucesso.' });

      // 3. Acessa listagem de servidores para coletar os IDs
      await page.goto('https://sgp.sejus.ro.gov.br/servidor', { waitUntil: 'networkidle' });

      const sejusIds: number[] = [];
      let hasNextPage = true;
      let pageCount = 1;

      while (hasNextPage && pageCount <= 50) {
        if (globalThis.__sipeStopFlag) {
          const msg = 'Sincronização interrompida pelo usuário durante a coleta de IDs.';
          await dbProgress(jobId, {
            status: 'INTERRUPTED',
            fase: 'Interrompido',
            log: msg,
            finalizadoEm: new Date(),
          });
          refreshMemory(jobId, { status: 'INTERRUPTED', fase: 'Interrompido', ultimoLog: msg });
          await browser.close().catch(() => {});
          return;
        }

        const logMsg = `Coletando IDs dos servidores: Página ${pageCount}...`;
        console.log(`[SERVIDORES SCRAPER] ${logMsg}`);
        refreshMemory(jobId, { ultimoLog: logMsg });
        await dbProgress(jobId, { log: logMsg });

        const html = await page.content();
        const $ = cheerio.load(html);

        $('a').each((_, a) => {
          const href = $(a).attr('href') || '';
          const match = href.match(/vinculo\/(\d+)/) || href.match(/servidor\/(\d+)/);
          if (match) {
            const id = parseInt(match[1]);
            if (!isNaN(id)) sejusIds.push(id);
          }
        });

        // Tenta ir para a próxima página
        const nextBtn = page.locator('a:has-text("Próximo"), li.next a, button:has-text("Próxima"), i.fa-angle-right').first();
        if (await nextBtn.count() > 0 && await nextBtn.isEnabled()) {
          await nextBtn.click();
          await page.waitForLoadState('networkidle').catch(() => {});
          pageCount++;
          // Pequeno delay preventivo
          await page.waitForTimeout(300);
        } else {
          hasNextPage = false;
        }
      }

      const uniqueIds = [...new Set(sejusIds)];
      console.log(`[SERVIDORES SCRAPER] Encontrados ${uniqueIds.length} servidores exclusivos.`);

      if (uniqueIds.length === 0) {
        const msg = 'Nenhum servidor encontrado na listagem.';
        await dbProgress(jobId, {
          status: 'COMPLETED',
          fase: 'Concluído',
          log: msg,
          finalizadoEm: new Date(),
        });
        refreshMemory(jobId, { status: 'COMPLETED', fase: 'Concluído', ultimoLog: msg });
        await browser.close().catch(() => {});
        return;
      }

      // Inicializa diretório de uploads
      const baseUploadsDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
      const servidoresDir = join(baseUploadsDir, 'servidores');
      if (!existsSync(servidoresDir)) {
        mkdirSync(servidoresDir, { recursive: true });
      }

      refreshMemory(jobId, { total: uniqueIds.length, fase: 'Processando' });
      await dbProgress(jobId, {
        total: uniqueIds.length,
        fase: 'Processando',
        idsColetados: JSON.stringify(uniqueIds),
        log: `Coletados ${uniqueIds.length} IDs de servidores. Iniciando processamento dos vínculos...`,
      });

      const processedIds: string[] = [];

      // 4. Processamento individual de cada servidor
      for (let i = 0; i < uniqueIds.length; i++) {
        if (globalThis.__sipeStopFlag) {
          const msg = 'Sincronização interrompida pelo usuário.';
          await dbProgress(jobId, {
            status: 'INTERRUPTED',
            fase: 'Interrompido',
            log: msg,
            finalizadoEm: new Date(),
          });
          refreshMemory(jobId, { status: 'INTERRUPTED', fase: 'Interrompido', ultimoLog: msg });
          await browser.close().catch(() => {});
          return;
        }

        const sejusId = uniqueIds[i];
        const logMsg = `[${i + 1}/${uniqueIds.length}] Processando servidor ID ${sejusId}...`;
        console.log(`[SERVIDORES SCRAPER] ${logMsg}`);
        refreshMemory(jobId, { processado: i, ultimoLog: logMsg });

        if (i % 20 === 0 || i === uniqueIds.length - 1) {
          await dbProgress(jobId, { processado: i, log: logMsg });
        } else {
          await dbProgress(jobId, { processado: i });
        }

        try {
          const vinculoUrl = `https://sgp.sejus.ro.gov.br/vinculo/${sejusId}`;
          await page.goto(vinculoUrl, { waitUntil: 'networkidle' });

          const htmlDetails = await page.content();
          const $details = cheerio.load(htmlDetails);

          // Função inteligente de extração baseada em regex
          const extractField = (labelRegex: RegExp): string => {
            let foundVal = '';
            $details('div, td, th, span, p, label').each((_, el) => {
              const text = $details(el).text().trim();
              if (labelRegex.test(text)) {
                const nextSib = $details(el).next();
                if (nextSib.length > 0 && nextSib.text().trim().length > 0) {
                  foundVal = nextSib.text().trim();
                  return false;
                }
                if (text.includes(':')) {
                  const parts = text.split(':');
                  if (parts.length > 1 && parts[1].trim().length > 0) {
                    foundVal = parts[1].trim();
                    return false;
                  }
                }
                if (el.tagName === 'td' || el.tagName === 'th') {
                  const row = $details(el).closest('tr');
                  const cells = row.find('td, th');
                  const idx = cells.index(el);
                  if (idx !== -1 && idx < cells.length - 1) {
                    foundVal = cells.eq(idx + 1).text().trim();
                    return false;
                  }
                }
              }
            });
            return foundVal;
          };

          const cpf = extractField(/CPF/i);
          const matricula = extractField(/Matrícula|Matricula/i);
          const cargo = extractField(/Cargo|Função/i);
          const lotacao = extractField(/Lotação|Lotacao|Unidade|Setor/i);
          const situacao = extractField(/Situação|Situacao|Status/i);
          const regime = extractField(/Regime|Vínculo|Vinculo/i);
          const dataAdmissao = extractField(/Admissão|Admissao|Posse|Exercício/i);

          let nome = extractField(/Nome/i);
          if (!nome) {
            nome = $details('h1, h2, h3, .nome, .titulo, title').first().text().trim();
            nome = nome.replace(/SGP|Servidor|Detalhe/gi, '').trim();
          }

          // 5. Coleta da foto do Servidor
          let photoUrl = '';
          $details('img').each((_, img) => {
            const src = $details(img).attr('src') || '';
            if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('menu') && !src.includes('captcha')) {
              photoUrl = src;
              return false;
            }
          });

          let localPhotoPath: string | null = null;
          let photoHashSha: string | null = null;

          if (photoUrl) {
            try {
              const absolutePhotoUrl = photoUrl.startsWith('http') 
                ? photoUrl 
                : new URL(photoUrl, 'https://sgp.sejus.ro.gov.br').toString();

              const photoResponse = await page.request.get(absolutePhotoUrl);
              if (photoResponse.ok()) {
                const imageBuffer = await photoResponse.body();

                const webpBuffer = await sharp(imageBuffer)
                  .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: 90 })
                  .toBuffer();

                const hashSha = createHash('sha256').update(webpBuffer).digest('hex');
                const filename = `servidor-${sejusId}.webp`;
                const targetPath = join(servidoresDir, filename);

                let shouldWrite = true;
                if (existsSync(targetPath)) {
                  const existingBuffer = await readFile(targetPath);
                  const existingHash = createHash('sha256').update(existingBuffer).digest('hex');
                  if (existingHash === hashSha) {
                    shouldWrite = false;
                  }
                }

                if (shouldWrite) {
                  await writeFile(targetPath, webpBuffer);
                }

                localPhotoPath = `uploads/servidores/${filename}`;
                photoHashSha = hashSha;
              }
            } catch (photoErr: any) {
              console.warn(`[SERVIDORES SCRAPER] Falha ao obter foto do servidor ${sejusId}: ${photoErr.message || photoErr}`);
            }
          }

          // 6. Grava ou atualiza SejusServidor no Banco
          const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;
          let servidor = await prisma.sejusServidor.findUnique({
            where: { sejusId }
          });

          const updateData = {
            nome: nome || `Servidor #${sejusId}`,
            cpf: cleanCpf,
            matricula: matricula || null,
            cargo: cargo || null,
            lotacao: lotacao || null,
            situacao: situacao || null,
            regime: regime || null,
            dataAdmissao: dataAdmissao || null,
            photoPath: localPhotoPath || servidor?.photoPath || null,
            // Se a foto física mudou, reseta o faceDescriptor para forçar reindexação ArcFace
            ...(localPhotoPath && (!servidor || servidor.photoPath !== localPhotoPath) ? { faceDescriptor: null, detScore: null } : {}),
          };

          if (servidor) {
            servidor = await prisma.sejusServidor.update({
              where: { id: servidor.id },
              data: updateData
            });
          } else {
            servidor = await prisma.sejusServidor.create({
              data: {
                sejusId,
                ...updateData
              }
            });
          }

          processedIds.push(servidor.id);
        } catch (err: any) {
          console.error(`[SERVIDORES SCRAPER] Erro no servidor ID ${sejusId}:`, err);
          globalThis.__sipeState!.erros++;
          await dbProgress(jobId, {
            log: `[ERRO] Servidor ID ${sejusId}: ${err.message || err}`,
          });
        }
      }

      // 7. Indexação facial via ArcFace
      if (processedIds.length > 0) {
        refreshMemory(jobId, { fase: 'Indexando Rostos' });
        await dbProgress(jobId, {
          processado: uniqueIds.length,
          fase: 'Indexando Rostos',
          log: `Scraping de dados concluído. Iniciando indexação facial de ${processedIds.length} servidor(es)...`,
        });

        try {
          await runServidoresIndexing(jobId, processedIds);
        } catch (faceErr: any) {
          console.error('[SERVIDORES SCRAPER] Erro na indexação facial:', faceErr);
          await dbProgress(jobId, {
            log: `[AVISO] Erro na indexação facial: ${faceErr.message || faceErr}`,
          });
        }
      }

      // Conclusão com sucesso
      const finalMsg = `Sincronização de servidores concluída! Processados: ${uniqueIds.length}, Erros: ${globalThis.__sipeState!.erros}`;
      refreshMemory(jobId, {
        status: 'COMPLETED',
        fase: 'Concluído',
        ultimoLog: finalMsg,
        processado: uniqueIds.length,
      });
      await dbProgress(jobId, {
        status: 'COMPLETED',
        fase: 'Concluído',
        log: finalMsg,
        processado: uniqueIds.length,
        finalizadoEm: new Date(),
      });

    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error('[SERVIDORES SCRAPER] Erro fatal no loop de sync:', err);
      globalThis.__sipeState = {
        ...globalThis.__sipeState!,
        status: 'FAILED',
        ultimoLog: `Erro fatal: ${msg}`,
      };
      await dbProgress(jobId, {
        status: 'FAILED',
        finalizadoEm: new Date(),
        log: `Erro fatal no scraper de servidores: ${msg}`,
      });
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  };

  runPromise().catch((err) => {
    console.error('[SERVIDORES SCRAPER] Promessa de execução falhou:', err);
  });
}
