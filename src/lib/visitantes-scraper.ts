import { prisma } from './db';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { requestSipeViaProxy } from './sipe-scraper';
import { runVisitantesIndexing } from './visitante-indexing';

export interface VisitantesSyncProgress {
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

function refreshMemory(jobId: string, patch: Partial<VisitantesSyncProgress>) {
  if (!globalThis.__sipeState || globalThis.__sipeState.jobId !== jobId) return;
  Object.assign(globalThis.__sipeState, patch);
  if (globalThis.__sipeState.total > 0) {
    globalThis.__sipeState.pct = Math.round(
      (globalThis.__sipeState.processado / globalThis.__sipeState.total) * 100
    );
  }
}

export function startVisitantesSync(jobId: string): void {
  // Previne múltiplas execuções simultâneas
  if (globalThis.__sipeState?.status === 'RUNNING') return;

  globalThis.__sipeStopFlag = false;
  globalThis.__sipeCurrentEngine = 'python-sdk'; // Módulo de visitantes só funciona em python-sdk
  globalThis.__sipeState = {
    jobId,
    status: 'RUNNING',
    fase: 'Iniciando...',
    total: 0,
    processado: 0,
    erros: 0,
    ultimoLog: 'Iniciando sincronização de visitantes...',
    startTime: Date.now(),
    pct: 0,
    tipo: 'VISITANTES',
  };

  const runPromise = async () => {
    const job = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Job não encontrado no banco.');

    let uniqueIds: string[] = [];
    let alreadyDone = 0;
    let token = '';

    // 1. Obtém o token CSRF (exigido para fazer os POSTs de fichaGeralVisita)
    const pathList = '/visitas/apenadosporvisita';
    const listResponse = await requestSipeViaProxy({
      path: pathList,
      method: 'GET',
      headers: {
        'X-Sipe-Perfil': 'visitas-entradas', // Força o perfil correto
      },
    });

    if (!listResponse || listResponse.is_binary) {
      throw new Error('Falha ao obter a página de listagem de visitantes do SIPE via Proxy Python.');
    }

    const htmlList = listResponse.html || listResponse.text || '';
    const $list = cheerio.load(htmlList);

    // Captura o token CSRF do formulário
    token = $list('form[action*="fichaGeralVisita"] input[name="_token"]').val() as string;
    if (!token) {
      throw new Error('Não foi possível obter o token CSRF (input _token) da página do SIPE.');
    }

    if (job.idsColetados) {
      // Retomada: Recupera IDs e cursor
      uniqueIds = JSON.parse(job.idsColetados) as string[];
      alreadyDone = job.processado ?? 0;
      
      const cursor = job.ultimoIdProcessado ? String(job.ultimoIdProcessado) : null;
      let startIndex = 0;
      if (cursor !== null) {
        const cursorIndex = uniqueIds.indexOf(cursor);
        startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      }
      
      const remainingCount = uniqueIds.length - startIndex;
      const logMsg = `Retomando sincronização de visitantes a partir do ID #${cursor ?? 'início'} — ${remainingCount} visitantes restantes.`;
      console.log(`[VISITANTES SCRAPER] ${logMsg}`);
      
      refreshMemory(jobId, {
        fase: 'Retomando',
        total: uniqueIds.length,
        processado: alreadyDone,
        ultimoLog: logMsg,
      });
      await dbProgress(jobId, {
        log: logMsg,
        fase: 'Retomando',
      });
    } else {
      // Novo início
      await dbProgress(jobId, {
        status: 'RUNNING',
        fase: 'Login',
        processado: 0,
        erros: 0,
        total: 0,
        ultimoIdProcessado: null,
        log: 'Iniciando scraping de visitantes no SIPE. Mudando perfil para Visitas-Entradas...',
      });

      // Identifica o total de páginas na paginação
      let totalPages = 1;
      $list('ul.pagination li a').each((_, a) => {
        const href = $list(a).attr('href') || '';
        const match = href.match(/page=(\d+)/);
        if (match) {
          const pageNum = parseInt(match[1]);
          if (pageNum > totalPages) {
            totalPages = pageNum;
          }
        }
      });

      console.log(`[VISITANTES SCRAPER] Identificado o total de ${totalPages} páginas.`);

      // Coleta os IDs de visitantes
      const visitaIds: string[] = [];
      $list('td[data-visita_id]').each((_, td) => {
        const id = $list(td).attr('data-visita_id');
        if (id) visitaIds.push(id.trim());
      });

      // Se houver mais de 1 página, faz a paginação para obter todos os IDs
      if (totalPages > 1) {
        const batchSize = 3;
        const pagesToFetch: number[] = [];
        for (let p = 2; p <= totalPages; p++) {
          pagesToFetch.push(p);
        }

        for (let i = 0; i < pagesToFetch.length; i += batchSize) {
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

          const batch = pagesToFetch.slice(i, i + batchSize);
          const logMsg = `Coletando IDs das páginas: lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(pagesToFetch.length / batchSize)} (Páginas ${batch[0]} a ${batch[batch.length - 1]} de ${totalPages})`;
          console.log(`[VISITANTES SCRAPER] ${logMsg}`);

          refreshMemory(jobId, {
            fase: 'Coletando IDs',
            ultimoLog: logMsg,
          });
          await dbProgress(jobId, {
            fase: 'Coletando IDs',
            log: logMsg,
          });

          await Promise.all(
            batch.map(async (page) => {
              try {
                const resPage = await requestSipeViaProxy({
                  path: `/visitas/apenadosporvisita?page=${page}`,
                  method: 'GET',
                  headers: {
                    'X-Sipe-Perfil': 'visitas-entradas',
                  },
                });

                if (resPage && !resPage.is_binary) {
                  const htmlPage = resPage.html || resPage.text || '';
                  const $page = cheerio.load(htmlPage);
                  $page('td[data-visita_id]').each((_, td) => {
                    const id = $page(td).attr('data-visita_id');
                    if (id) visitaIds.push(id.trim());
                  });
                }
              } catch (pageErr: any) {
                console.error(`[VISITANTES SCRAPER] Erro ao carregar página de visitante ${page}:`, pageErr.message || pageErr);
              }
            })
          );

          // Delay para evitar sobrecarga no SIPE/Proxy
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      uniqueIds = [...new Set(visitaIds)].filter(Boolean);
      console.log(`[VISITANTES SCRAPER] Encontrados ${uniqueIds.length} visitantes na listagem.`);

      if (uniqueIds.length === 0) {
        const msg = 'Nenhum visitante encontrado na página de listagem.';
        await dbProgress(jobId, {
          status: 'COMPLETED',
          fase: 'Concluído',
          log: msg,
          finalizadoEm: new Date(),
        });
        refreshMemory(jobId, { status: 'COMPLETED', fase: 'Concluído', ultimoLog: msg });
        return;
      }

      // Atualiza progresso do Job
      refreshMemory(jobId, { total: uniqueIds.length, fase: 'Processando' });
      await dbProgress(jobId, {
        total: uniqueIds.length,
        fase: 'Processando',
        idsColetados: JSON.stringify(uniqueIds),
        log: `Coletados ${uniqueIds.length} visitantes. Iniciando processamento individual...`,
      });
    }

    const baseUploadsDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const visitantesDir = join(baseUploadsDir, 'visitantes');
    if (!existsSync(visitantesDir)) {
      mkdirSync(visitantesDir, { recursive: true });
    }

    const processedIds: string[] = [];

    // Determina o índice de início baseado no ultimoIdProcessado do job
    const startIndex = job.idsColetados && job.ultimoIdProcessado
      ? uniqueIds.indexOf(String(job.ultimoIdProcessado)) + 1
      : 0;

    // 2. Loop sobre os IDs dos visitantes a partir do startIndex
    for (let i = startIndex; i < uniqueIds.length; i++) {
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

      const visitaId = uniqueIds[i];
      const logMsg = `[${i + 1}/${uniqueIds.length}] Processando visitante ID ${visitaId}...`;
      console.log(`[VISITANTES SCRAPER] ${logMsg}`);
      
      refreshMemory(jobId, {
        processado: i,
        ultimoLog: logMsg,
      });
      if (i % 100 === 0 || i === uniqueIds.length - 1) {
        await dbProgress(jobId, {
          processado: i,
          ultimoIdProcessado: parseInt(visitaId, 10) || null,
          log: logMsg,
        });
      } else {
        await dbProgress(jobId, {
          processado: i,
          ultimoIdProcessado: parseInt(visitaId, 10) || null,
        });
      }

      try {
        // Gera a ficha geral do visitante via POST
        const fichaResponse = await requestSipeViaProxy({
          path: '/visitas/fichaGeralVisita',
          method: 'POST',
          headers: {
            'X-Sipe-Perfil': 'visitas-entradas',
          },
          form: {
            _token: token,
            visita_id: visitaId,
            'listar[]': ['DP', 'AC', 'EV', 'SAC'],
          },
        });

        if (!fichaResponse || fichaResponse.is_binary) {
          throw new Error(`Resposta inválida ao obter ficha do visitante ID ${visitaId}`);
        }

        const htmlFicha = fichaResponse.html || fichaResponse.text || '';
        const $ficha = cheerio.load(htmlFicha);

        // Helper para capturar valor de input baseado no label
        const getInputValue = (labelTarget: string) => {
          let value = '';
          $ficha('.input').each((_, div) => {
            const labelText = $ficha(div).find('label').text().trim().toLowerCase();
            if (labelText.includes(labelTarget.toLowerCase())) {
              value = ($ficha(div).find('input').val() as string) || '';
              return false;
            }
          });
          return value.trim();
        };

        const nome = getInputValue('Nome');
        const cpf = getInputValue('CPF');
        const certidaoNascimento = getInputValue('Certidão Nascimento');
        const dataNascimento = getInputValue('Data de Nascimento');
        const sexo = getInputValue('Sexo');
        const telefone = getInputValue('Telefone');
        const naturalidade = getInputValue('Naturalidade');
        const dataCarteirinha = getInputValue('Data Carteirinha');
        const nomeMae = getInputValue('Nome Mãe');
        const nomePai = getInputValue('Nome Pai');
        const logradouro = getInputValue('Endereço - Logradouro');
        const numero = getInputValue('Número');
        const bairro = getInputValue('Bairro');
        const cidadeUf = getInputValue('Cidade/UF');

        if (!nome) {
          throw new Error('Nome do visitante não pôde ser extraído da ficha.');
        }

        // 3. Tratamento de Foto do Visitante
        let localPhotoPath: string | null = null;
        let photoHashSha: string | null = null;
        const imgEl = $ficha('.logofoto');
        const imgSrc = imgEl.attr('src');

        if (imgSrc && !imgSrc.includes('semfoto') && !imgSrc.includes('Undefined')) {
          try {
            // Obtém caminho relativo para a foto no proxy
            let photoRelativePath = imgSrc;
            if (imgSrc.startsWith('http')) {
              const urlObj = new URL(imgSrc);
              photoRelativePath = urlObj.pathname;
            }

            console.log(`[VISITANTES SCRAPER] Baixando foto de ${photoRelativePath}...`);
            const photoRes = await requestSipeViaProxy({
              path: photoRelativePath,
              method: 'GET',
              headers: {
                'X-Sipe-Perfil': 'visitas-entradas',
              },
            });

            if (photoRes && photoRes.is_binary && photoRes.data) {
              const base64Content = photoRes.data.includes(',')
                ? photoRes.data.split(',')[1]
                : photoRes.data;
              const imageBuffer = Buffer.from(base64Content, 'base64');

              // Converte para WebP usando sharp
              const webpBuffer = await sharp(imageBuffer)
                .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 90 })
                .toBuffer();

              const hashSha = createHash('sha256').update(webpBuffer).digest('hex');
              const filename = `visitante-${visitaId}.webp`;
              const targetPath = join(visitantesDir, filename);

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
                console.log(`[VISITANTES SCRAPER] Foto salva com sucesso em: ${targetPath}`);
              }

              localPhotoPath = `uploads/visitantes/${filename}`;
              photoHashSha = hashSha;
            }
          } catch (photoErr: any) {
            console.warn(`[VISITANTES SCRAPER] Falha ao baixar/processar foto do visitante ${visitaId}: ${photoErr.message || photoErr}`);
          }
        }

        // 4. Salva ou atualiza SipeVisitante no banco de dados
        const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;
        let visitante = await prisma.sipeVisitante.findFirst({
          where: {
            OR: [
              { carteirinha: visitaId },
              cleanCpf ? { cpf: cleanCpf } : null,
            ].filter(Boolean) as any,
          },
        });

        const updateData = {
          nome: nome,
          cpf: cleanCpf,
          carteirinha: visitaId,
          certidaoNascimento: certidaoNascimento || null,
          dataNascimento: dataNascimento || null,
          sexo: sexo || null,
          telefone: telefone || null,
          naturalidade: naturalidade || null,
          dataCarteirinha: dataCarteirinha || null,
          nomeMae: nomeMae || null,
          nomePai: nomePai || null,
          logradouro: logradouro || null,
          numero: numero || null,
          bairro: bairro || null,
          cidadeUf: cidadeUf || null,
          photoPath: localPhotoPath || visitante?.photoPath || null,
          photoHashSha: photoHashSha || visitante?.photoHashSha || null,
          // Se a foto física mudou, reseta o faceDescriptor para forçar reindexação ArcFace
          ...(photoHashSha && photoHashSha !== visitante?.photoHashSha ? { faceDescriptor: null, detScore: null } : {}),
        };

        if (visitante) {
          visitante = await prisma.sipeVisitante.update({
            where: { id: visitante.id },
            data: updateData,
          });
        } else {
          visitante = await prisma.sipeVisitante.create({
            data: updateData,
          });
        }

        processedIds.push(visitante.id);

        // 5. Histórico de Entradas
        // Limpa registros anteriores para este visitante
        await prisma.sipeVisitanteEntrada.deleteMany({
          where: { visitanteId: visitante.id },
        });

        // Extrai entradas do HTML da Ficha
        let tabela = null;
        $ficha('table').each((_, tab) => {
          const text = $ficha(tab).text();
          if (text.includes('Nome Apenado') && text.includes('Data Entrada')) {
            tabela = tab;
            return false;
          }
        });

        if (tabela) {
          const entradasToCreate: any[] = [];
          $ficha(tabela).find('tbody tr, tr').each((_, tr) => {
            const cols: string[] = [];
            $ficha(tr).find('td, th').each((_, el) => {
              cols.push($ficha(el).text().trim().replace(/\s+/g, ' '));
            });

            if (cols.length >= 6 && cols[0] !== 'Tipo') {
              const tipoEntrada = cols[0];
              const nomeApenado = cols[1];
              const unidadePrisional = cols[2];
              const dataEntradaStr = cols[3];
              const diaStr = cols[4];
              const situacaoStr = cols[5];

              // Parseia a data de entrada
              let dataEntrada: Date | null = null;
              if (dataEntradaStr && !dataEntradaStr.includes('---')) {
                const match = dataEntradaStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
                if (match) {
                  dataEntrada = new Date(
                    parseInt(match[3]),
                    parseInt(match[2]) - 1,
                    parseInt(match[1]),
                    parseInt(match[4]),
                    parseInt(match[5]),
                    parseInt(match[6])
                  );
                } else {
                  const matchDate = dataEntradaStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
                  if (matchDate) {
                    dataEntrada = new Date(
                      parseInt(matchDate[3]),
                      parseInt(matchDate[2]) - 1,
                      parseInt(matchDate[1])
                    );
                  }
                }
              }

              entradasToCreate.push({
                visitanteId: visitante!.id,
                tipo: tipoEntrada || null,
                nomeApenado: nomeApenado || null,
                unidadePrisional: unidadePrisional || null,
                dataEntrada: dataEntrada,
                dia: diaStr || null,
                situacao: situacaoStr || null,
              });
            }
          });

          if (entradasToCreate.length > 0) {
            await prisma.sipeVisitanteEntrada.createMany({
              data: entradasToCreate,
            });

            // Associa o vínculo com os apenados locais por aproximação de nome
            const uniqueNomeApenados = [...new Set(entradasToCreate.map((e) => e.nomeApenado).filter(Boolean))];
            for (const nomeAp of uniqueNomeApenados) {
              const apenadoLocal = await prisma.sipeApenadoImportado.findFirst({
                where: { nome: { equals: nomeAp, mode: 'insensitive' } },
              });

              if (apenadoLocal) {
                await prisma.sipeVinculoVisitante.upsert({
                  where: {
                    apenadoId_visitanteId: {
                      apenadoId: apenadoLocal.id,
                      visitanteId: visitante.id,
                    },
                  },
                  update: { ativo: true },
                  create: {
                    apenadoId: apenadoLocal.id,
                    visitanteId: visitante.id,
                    ativo: true,
                  },
                });
              }
            }
          }
        }
      } catch (err: any) {
        console.error(`[VISITANTES SCRAPER] Erro no visitante ID ${visitaId}:`, err);
        globalThis.__sipeState!.erros++;
        await dbProgress(jobId, {
          log: `[ERRO] Visitante ID ${visitaId}: ${err.message || err}`,
        });
      }
    }

    // 6. Indexação Facial ArcFace (em lote)
    if (processedIds.length > 0) {
      refreshMemory(jobId, { fase: 'Indexando Rostos' });
      await dbProgress(jobId, {
        processado: uniqueIds.length,
        fase: 'Indexando Rostos',
        log: `Processamento de dados textuais concluído. Iniciando indexação facial de ${processedIds.length} visitante(s)...`,
      });

      try {
        await runVisitantesIndexing(jobId, processedIds);
      } catch (faceErr: any) {
        console.error('[VISITANTES SCRAPER] Erro no pipeline ArcFace de visitantes:', faceErr);
        await dbProgress(jobId, {
          log: `[AVISO] Erro na indexação facial: ${faceErr.message || faceErr}`,
        });
      }
    }

    // Conclusão
    const finalMsg = `Sincronização de visitantes concluída com sucesso! Processados: ${uniqueIds.length}, Erros: ${globalThis.__sipeState!.erros}`;
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
  };

  // Dispara a Promise em segundo plano para retorno imediato do endpoint
  runPromise().catch(async (err) => {
    const msg = err?.message ?? String(err);
    console.error('[VISITANTES SCRAPER] Erro fatal no loop de sync:', err);
    globalThis.__sipeState = {
      ...globalThis.__sipeState!,
      status: 'FAILED',
      ultimoLog: `Erro fatal: ${msg}`,
    };
    await dbProgress(jobId, {
      status: 'FAILED',
      finalizadoEm: new Date(),
      log: `Erro fatal no scraper de visitantes: ${msg}`,
    });
  });
}
