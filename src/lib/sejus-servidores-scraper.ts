import { prisma } from './db';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, readFile } from 'fs/promises';
import { createHash } from 'crypto';
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

// ── Cliente HTTP Customizado para o SGP ─────────────────────────────────────
class SgpHttpClient {
  private cookies = new Map<string, string>();
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  private baseUrl = 'https://sgp.sejus.ro.gov.br';

  public updateCookies(setCookieHeader: string[] | null | undefined) {
    if (!setCookieHeader) return;
    setCookieHeader.forEach(cookieStr => {
      const parts = cookieStr.split(';')[0].split('=');
      if (parts.length >= 2) {
        this.cookies.set(parts[0].trim(), parts.slice(1).join('=').trim());
      }
    });
  }

  public getCookieHeader(): string {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  public async request(path: string, options: {
    method?: 'GET' | 'POST';
    body?: string | URLSearchParams;
    headers?: Record<string, string>;
    redirect?: 'manual' | 'follow';
  } = {}) {
    const method = options.method ?? 'GET';
    const cleanPath = path.startsWith('http') 
      ? path.replace('https://sgp.sejus.ro.gov.br', '') 
      : path;
    const pythonApiUrl = process.env.SIPE_PYTHON_API_URL || 'http://localhost:8000';

    let form: Record<string, string> | undefined = undefined;
    if (options.body) {
      form = {};
      const params = new URLSearchParams(options.body.toString());
      params.forEach((value, key) => {
        if (form) form[key] = value;
      });
    }

    const res = await fetch(`${pythonApiUrl}/sgp/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': this.getCookieHeader()
      },
      body: JSON.stringify({
        path: cleanPath,
        method: method,
        form: form,
        headers: options.headers
      })
    });

    if (!res.ok) {
      throw new Error(`SGP Proxy error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    this.updateCookies(data.set_cookies);

    return {
      status: data.status,
      ok: data.status >= 200 && data.status < 300,
      headers: {
        get: (key: string) => {
          if (key.toLowerCase() === 'location') return data.headers?.['location'] || data.headers?.['Location'];
          return data.headers?.[key] || null;
        },
        entries: () => Object.entries(data.headers || {})
      },
      text: async () => data.html || data.text || '',
      arrayBuffer: async () => {
        if (data.is_binary && data.data) {
          return Buffer.from(data.data, 'base64') as any;
        }
        return Buffer.from(data.html || data.text || '') as any;
      }
    };
  }

  private formatCpf(cpf: string): string {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length === 11) {
      return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
    }
    return cpf;
  }

  public async login(): Promise<boolean> {
    try {
      dotenv.config({ path: join(process.cwd(), '.env'), override: true });
    } catch (envErr) {
      console.warn('[SERVIDORES SCRAPER] Erro ao recarregar .env dinamicamente:', envErr);
    }

    const rawUsername = process.env.SEJUS_SGP_USER || process.env.SIPE_CPF || '';
    const password = process.env.SEJUS_SGP_PASS || process.env.SIPE_SENHA || '';

    const cleanUsername = rawUsername.replace(/^['"]|['"]$/g, '').trim();
    const cleanPassword = password.replace(/^['"]|['"]$/g, '').trim();

    if (!cleanUsername || !cleanPassword) {
      throw new Error('Credenciais de acesso ao SGP (SEJUS_SGP_USER / SIPE_CPF) não configuradas no arquivo .env.');
    }

    const username = this.formatCpf(cleanUsername);
    const pythonApiUrl = process.env.SIPE_PYTHON_API_URL || 'http://localhost:8000';

    const loginRes = await fetch(`${pythonApiUrl}/sgp/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cpf: username,
        senha: cleanPassword
      })
    });

    if (!loginRes.ok) {
      const errData = await loginRes.json().catch(() => ({}));
      throw new Error(errData.detail || `Erro ao efetuar login no SGP via API Python (Status: ${loginRes.status}).`);
    }

    const data = await loginRes.json();
    if (data.cookies && data.cookies.length > 0) {
      this.updateCookies(data.cookies);
      console.log('[SERVIDORES SCRAPER] Login efetuado com sucesso via API Python SGP.');
      return true;
    }

    throw new Error('Nenhum cookie de sessão retornado pela API de login do SGP.');
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
    // Força a recarga do .env local
    try {
      dotenv.config({ path: join(process.cwd(), '.env'), override: true });
    } catch {}

    const rawUsername = process.env.SEJUS_SGP_USER || process.env.SIPE_CPF || '';
    const password = process.env.SEJUS_SGP_PASS || process.env.SIPE_SENHA || '';
    const cleanUser = rawUsername.replace(/^['"]|['"]$/g, '').trim();
    const cleanPass = password.replace(/^['"]|['"]$/g, '').trim();
    const obfuscatedPass = cleanPass ? `${cleanPass.slice(0, 2)}...${cleanPass.slice(-2)}` : '(vazia)';

    await dbProgress(jobId, {
      status: 'RUNNING',
      fase: 'Login',
      processado: 0,
      erros: 0,
      total: 0,
      ultimoIdProcessado: null,
      log: `Conectando ao SGP SEJUS via requisições HTTP...\n[DEBUG] Utilizando CPF: "${cleanUser}" | Senha: "${obfuscatedPass}"`,
    });

    const client = new SgpHttpClient();
    try {
      // 1 e 2. Login e seleção do perfil
      await client.login();

      console.log('[SERVIDORES SCRAPER] Logado com sucesso via HTTP.');
      await dbProgress(jobId, {
        fase: 'Coletando IDs',
        log: 'Login efetuado com sucesso. Acessando listagem de servidores...',
      });
      refreshMemory(jobId, { fase: 'Coletando IDs', ultimoLog: 'Login efetuado com sucesso.' });

      // 3. Acessa listagem de servidores para coletar os IDs
      const sejusIds: number[] = [];
      let pageCount = 1;
      let currentPath = '/servidor';

      while (pageCount <= 50) {
        if (globalThis.__sipeStopFlag) {
          const msg = 'Sincronização interrompida pelo usuário durante a coleta de IDs.';
          await dbProgress(jobId, {
            status: 'INTERRUPTED',
            fase: 'Interrompido',
            log: msg,
            finalizadoEm: new Date(),
          });
          refreshMemory(jobId, { status: 'INTERRUPTED', fase: 'Interrompido', ultimoLog: msg });
          return;
        }

        const logMsg = `Coletando IDs dos servidores: Página ${pageCount}...`;
        console.log(`[SERVIDORES SCRAPER] ${logMsg}`);
        refreshMemory(jobId, { ultimoLog: logMsg });
        await dbProgress(jobId, { log: logMsg });

        const res = await client.request(currentPath);
        const html = await res.text();
        const $ = cheerio.load(html);

        $('a').each((_, a) => {
          const href = $(a).attr('href') || '';
          const match = href.match(/vinculo\/(\d+)/) || href.match(/servidor\/ficha\/(\d+)/) || href.match(/servidor\/(\d+)/);
          if (match) {
            const id = parseInt(match[1]);
            if (!isNaN(id)) sejusIds.push(id);
          }
        });

        // Tenta ir para a próxima página buscando o link de paginação
        let nextHref: string | undefined = undefined;
        $('a').each((_, el) => {
          const txt = $(el).text().trim().toLowerCase();
          if (txt === 'próximo' || txt === 'próxima' || txt.includes('próximo') || txt.includes('próxima') || txt.includes('next')) {
            nextHref = $(el).attr('href');
            if (nextHref && nextHref !== '#') return false; // break loop
          }
        });

        if (!nextHref) {
          nextHref = $('li.next a, li.page-item.next a, a.next').attr('href');
        }

        if (!nextHref) {
          nextHref = $('i.fa-angle-right, i.fa-chevron-right').closest('a').attr('href');
        }

        if (nextHref && nextHref !== '#' && nextHref !== currentPath) {
          currentPath = nextHref;
          pageCount++;
          // Pequeno delay preventivo
          await new Promise(r => setTimeout(r, 300));
        } else {
          break;
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
          const vinculoUrl = `/servidor/ficha/${sejusId}`;
          const detailsRes = await client.request(vinculoUrl);
          const htmlDetails = await detailsRes.text();
          const $details = cheerio.load(htmlDetails);

          // Função inteligente de extração baseada em regex
          const extractField = (labelRegex: RegExp): string => {
            let foundVal = '';
            $details('td, th, label, span, p, div, li').each((_, el) => {
              const $el = $details(el);
              // Só processa elementos "folha" ou que tenham texto direto curto
              // para evitar que divs pai (que acumulam texto de filhos) capturem antes
              const hasBlockChildren = $el.children('div, table, ul, ol, section, article').length > 0;
              if (hasBlockChildren) return; // skip containers

              const text = $el.text().trim();
              // Ignora texto muito longo (provavelmente acumulou filhos)
              if (text.length > 120) return;
              if (!labelRegex.test(text)) return;

              // 1. Próximo sibling com texto
              const nextSib = $el.next();
              if (nextSib.length > 0 && nextSib.text().trim().length > 0 && nextSib.text().trim().length < 200) {
                foundVal = nextSib.text().trim();
                return false;
              }
              // 2. Texto inclui "Label: Valor"
              if (text.includes(':')) {
                const parts = text.split(':');
                if (parts.length > 1 && parts[1].trim().length > 0) {
                  foundVal = parts.slice(1).join(':').trim();
                  return false;
                }
              }
              // 3. Célula de tabela → próxima célula da mesma linha
              if (el.tagName === 'td' || el.tagName === 'th') {
                const row = $el.closest('tr');
                const cells = row.find('td, th');
                const idx = cells.index(el);
                if (idx !== -1 && idx < cells.length - 1) {
                  foundVal = cells.eq(idx + 1).text().trim();
                  return false;
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

              const photoResponse = await client.request(absolutePhotoUrl);
              if (photoResponse.ok) {
                const imageBuffer = Buffer.from(await photoResponse.arrayBuffer());

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
    }
  };

  runPromise().catch((err) => {
    console.error('[SERVIDORES SCRAPER] Promessa de execução falhou:', err);
  });
}

