/**
 * Remediação automática do bug de visitantes homônimos.
 *
 * Contexto: até o commit d903a50 a lista de visitantes de um apenado era montada
 * a partir de /autorizacoes/{id}/mostrar, cujo CPF/status são pouco confiáveis.
 * Com ~1020 nomes de visitantes repetidos na base (CPFs diferentes), isso criava
 * vínculos com a pessoa errada — um homônimo que nunca visitou aquele apenado
 * (ex.: SIPE 44810, com duas "ANA PAULA SOARES RUFATTO").
 *
 * O scraper já foi corrigido e usa a seção oficial "VISITANTES CADASTRADAS" da
 * Ficha Geral. Como cada sync apaga os vínculos e reconstrói a lista a partir
 * dela, basta re-sincronizar os apenados afetados para que se corrijam sozinhos.
 *
 * Este módulo faz isso em background no boot do servidor:
 *  - detecta os afetados pela assinatura do bug (mesmo nome, CPFs diferentes);
 *  - re-sincroniza um a um, com pausa entre eles para não sobrecarregar o SIPE;
 *  - é idempotente: quando a base está limpa, a detecção não retorna nada e
 *    o job encerra sem fazer requisição alguma;
 *  - aborta se a sessão do SIPE estiver expirada, e tenta de novo no próximo boot.
 *
 * Desligar: VISITANTES_REMEDIATION=off
 */
import { prisma } from './db'
import { scrapeApenadoFichaFast, resolveUnidadeIdByNome } from './sipe-scraper'

const LOG = '[REMEDIACAO VISITANTES]'

// Espera o boot assentar antes de começar. Precisa ser generoso: no boot o
// pgvector migra dezenas de milhares de vetores e ocupa o pool de conexões.
const BOOT_DELAY_MS = Number(process.env.VISITANTES_REMEDIATION_BOOT_DELAY_MS ?? 300_000)
// Pausa entre apenados, para não sobrecarregar o SIPE nem o pool do Prisma.
const DELAY_ENTRE_APENADOS_MS = Number(process.env.VISITANTES_REMEDIATION_DELAY_MS ?? 5_000)
// Erros REAIS seguidos (não os transitórios de pool) — aborta e tenta no próximo boot.
const MAX_FALHAS_CONSECUTIVAS = 5
// Pool cheio é transitório: recua e tenta o mesmo apenado de novo.
const MAX_TENTATIVAS_POOL = 5
const BACKOFF_POOL_MS = 15_000

/**
 * Pool de conexões esgotado / indisponível. É transitório e NÃO significa que o
 * SIPE caiu: acontece quando a app, o pgvector e esta remediação disputam as
 * poucas conexões do Prisma (o default é num_cpus*2+1 — só 5 numa VPS de 2 vCPU).
 * A remediação é trabalho de fundo e deve ceder a vez, nunca degradar o sistema.
 */
function isErroTransitorioDeBanco(err: any): boolean {
  const msg = String(err?.message || err)
  return (
    err?.code === 'P2024' ||
    msg.includes('connection pool') ||
    msg.includes('Timed out fetching a new connection')
  )
}

interface ApenadoAfetado {
  sipeId: number
  nome: string
  unidade: string | null
}

/**
 * Assinatura do bug: um apenado vinculado a DOIS+ visitantes de mesmo nome e
 * CPFs diferentes. A ficha oficial nunca lista a mesma pessoa duas vezes, logo
 * pelo menos um desses vínculos é um homônimo fantasma.
 */
export async function listarApenadosAfetados(): Promise<ApenadoAfetado[]> {
  return prisma.$queryRaw<ApenadoAfetado[]>`
    SELECT DISTINCT a."sipeId", a.nome, a.unidade
    FROM sipe_vinculos_visitantes l
    JOIN sipe_apenados_importados a ON a.id = l."apenadoId"
    JOIN sipe_visitantes v          ON v.id = l."visitanteId"
    WHERE (a.id, v.nome) IN (
      SELECT l2."apenadoId", v2.nome
      FROM sipe_vinculos_visitantes l2
      JOIN sipe_visitantes v2 ON v2.id = l2."visitanteId"
      GROUP BY l2."apenadoId", v2.nome
      HAVING COUNT(*) > 1 AND COUNT(DISTINCT v2.cpf) > 1
    )
    ORDER BY a."sipeId"`
}

async function resyncApenado(a: ApenadoAfetado): Promise<void> {
  const unidadeId = a.unidade ? await resolveUnidadeIdByNome(a.unidade) : '3'
  globalThis.__sipeCurrentEngine = 'python-sdk'
  globalThis.__sipeFallbackUnidade = unidadeId || '3'
  globalThis.__sipeStopFlag = false

  // Mesma estratégia da rota de sync individual: busca por nome primeiro
  // (resolve a unidade dinamicamente) e cai no acesso direto por sipeId.
  try {
    await scrapeApenadoFichaFast(a.sipeId, a.unidade, true)
  } catch (err: any) {
    if (err?.message === 'APENADO_NAO_ENCONTRADO') {
      await scrapeApenadoFichaFast(a.sipeId, a.unidade, false)
    } else {
      throw err
    }
  }
}

interface RemediacaoStatus {
  rodando: boolean
  iniciadoEm: string | null
  total: number
  processados: number
  corrigidos: number
  falhas: number
  ultimo: string | null
  finalizadoEm: string | null
  ultimoErro: string | null
}

const status: RemediacaoStatus = {
  rodando: false,
  iniciadoEm: null,
  total: 0,
  processados: 0,
  corrigidos: 0,
  falhas: 0,
  ultimo: null,
  finalizadoEm: null,
  ultimoErro: null,
}

/** Progresso da remediação — consultável pela rota /api/admin/remediacao-visitantes. */
export function getRemediacaoStatus(): RemediacaoStatus {
  return { ...status }
}

/**
 * Executa a remediação. Exportada para poder ser disparada sob demanda pela
 * rota administrativa, sem depender do hook de boot.
 */
export async function runRemediacaoVisitantes(): Promise<void> {
  if (status.rodando) return
  status.rodando = true
  status.iniciadoEm = new Date().toISOString()
  status.processados = 0
  status.corrigidos = 0
  status.falhas = 0
  status.finalizadoEm = null
  status.ultimoErro = null
  try {
    await run()
  } catch (err: any) {
    status.ultimoErro = err?.message || String(err)
    console.error(`${LOG} ❌ Erro inesperado na remediação:`, status.ultimoErro)
  } finally {
    status.rodando = false
    status.finalizadoEm = new Date().toISOString()
  }
}

async function run(): Promise<void> {
  const afetados = await listarApenadosAfetados()
  status.total = afetados.length

  if (afetados.length === 0) {
    console.log(`${LOG} ✓ Nenhum apenado com visitante homônimo duplicado. Nada a corrigir.`)
    return
  }

  console.log(`${LOG} 🔎 ${afetados.length} apenado(s) afetado(s) pelo bug de homônimos. Iniciando re-sincronização em background...`)

  let ok = 0
  let falhas = 0
  let falhasConsecutivas = 0

  for (const [i, a] of afetados.entries()) {
    // Não disputa a sessão do SIPE com uma sincronização global em andamento.
    if (globalThis.__sipeState?.status === 'RUNNING') {
      console.log(`${LOG} ⏸️ Sync global em andamento — remediação adiada para o próximo boot (${ok} corrigido(s) até aqui).`)
      return
    }

    status.processados = i + 1
    status.ultimo = `#${a.sipeId} ${a.nome}`

    let tentativasPool = 0
    let concluido = false

    while (!concluido) {
      try {
        await resyncApenado(a)
        ok++
        status.corrigidos = ok
        falhasConsecutivas = 0
        concluido = true
        console.log(`${LOG} [${i + 1}/${afetados.length}] ✅ #${a.sipeId} ${a.nome}`)
      } catch (err: any) {
        // Pool cheio não é erro do apenado nem do SIPE: é disputa por conexão.
        // Recua e tenta de novo, sem contar como falha — assim a remediação cede
        // a vez para a aplicação em vez de competir com ela.
        if (isErroTransitorioDeBanco(err)) {
          tentativasPool++
          if (tentativasPool <= MAX_TENTATIVAS_POOL) {
            const espera = BACKOFF_POOL_MS * tentativasPool
            console.warn(
              `${LOG} [${i + 1}/${afetados.length}] ⏳ Pool de conexões cheio — aguardando ${espera / 1000}s ` +
                `(tentativa ${tentativasPool}/${MAX_TENTATIVAS_POOL}). Isto NÃO é erro do SIPE.`
            )
            await new Promise((r) => setTimeout(r, espera))
            continue
          }
          console.warn(
            `${LOG} ⏸️ Pool de conexões seguiu cheio após ${MAX_TENTATIVAS_POOL} tentativas — ` +
              `o sistema está sob carga. Encerrando esta rodada para não competir com a aplicação; ` +
              `retomará no próximo boot ou via POST /api/admin/remediacao-visitantes. Corrigidos: ${ok}.`
          )
          return
        }

        falhas++
        status.falhas = falhas
        status.ultimoErro = err?.message || String(err)
        falhasConsecutivas++
        concluido = true
        console.warn(`${LOG} [${i + 1}/${afetados.length}] ⚠️ #${a.sipeId} ${a.nome}: ${err?.message || err}`)

        if (falhasConsecutivas >= MAX_FALHAS_CONSECUTIVAS) {
          console.error(
            `${LOG} ❌ ${MAX_FALHAS_CONSECUTIVAS} falhas seguidas no SIPE — possível sessão expirada ` +
              `(verifique com GET /sipe/diagnose). Abortando; será retomado no próximo boot. ` +
              `Corrigidos nesta rodada: ${ok}.`
          )
          return
        }
      }
    }

    await new Promise((r) => setTimeout(r, DELAY_ENTRE_APENADOS_MS))
  }

  const restantes = await listarApenadosAfetados()
  console.log(
    `${LOG} 🏁 Rodada concluída — corrigidos: ${ok}, falhas: ${falhas}, ainda afetados: ${restantes.length}.` +
      (restantes.length > 0 ? ' Os restantes serão retomados no próximo boot.' : ' Base limpa. ✓')
  )
}

/**
 * Dispara a remediação em background (não bloqueia o boot do servidor).
 * Seguro de chamar mais de uma vez: só roda uma vez por processo.
 */
export function startVisitantesHomonimosRemediation(): void {
  if (process.env.VISITANTES_REMEDIATION === 'off') {
    console.log(`${LOG} Desativada por VISITANTES_REMEDIATION=off.`)
    return
  }
  if (globalThis.__visitantesRemediationStarted) return
  globalThis.__visitantesRemediationStarted = true

  console.log(`${LOG} ⏱️ Remediação agendada para daqui a ${Math.round(BOOT_DELAY_MS / 1000)}s.`)
  setTimeout(() => {
    void runRemediacaoVisitantes()
  }, BOOT_DELAY_MS)
}

declare global {
  var __visitantesRemediationStarted: boolean | undefined
}
