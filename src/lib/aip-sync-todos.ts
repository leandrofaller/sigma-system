/**
 * Sincronização em massa dos apenados da aba AIP com o SIPE.
 *
 * Reusa scrapeApenadoFichaFast, o mesmo caminho do botão de sync individual —
 * então herda automaticamente todas as correções: visitantes vindos da seção
 * oficial da Ficha Geral, cela vinda da listagem do SIPE, gravação sequencial
 * dos visitantes e espelhamento do AIP ao fim do scrape.
 *
 * O desenho segue o que esta base já ensinou na prática:
 *  - SEQUENCIAL, com pausa: o pool do Prisma é de 5 conexões numa VPS de 2 vCPU;
 *    disparar em paralelo derruba a aplicação inteira junto.
 *  - Pool cheio é transitório, não é falha do SIPE: recua e tenta de novo.
 *  - Progresso consultável por HTTP: sem depender de log nem de acesso à VPS.
 *  - Não disputa a sessão do SIPE com um sync global já em andamento.
 *  - Cancelável: é um job de dezenas de minutos disparado por gente.
 */
import { prisma, isErroTransitorioDeBanco } from './db'
import { scrapeApenadoFichaFast, resolveUnidadeIdByNome } from './sipe-scraper'

const LOG = '[SYNC AIP TODOS]'

// Pausa entre apenados. Este job é conveniência administrativa e deve ceder a
// vez para quem está usando o sistema.
const DELAY_ENTRE_APENADOS_MS = Number(process.env.AIP_SYNC_TODOS_DELAY_MS ?? 3_000)
// Pool cheio: recua progressivamente antes de tentar o mesmo apenado de novo.
const MAX_TENTATIVAS_POOL = 5
const BACKOFF_POOL_MS = 15_000
// Falhas REAIS seguidas (não as de pool) sugerem sessão do SIPE caída.
const MAX_FALHAS_CONSECUTIVAS = 10

export interface SyncTodosAIPStatus {
  rodando: boolean
  iniciadoEm: string | null
  iniciadoPor: string | null
  finalizadoEm: string | null
  total: number
  processados: number
  sucesso: number
  falhas: number
  atual: string | null
  ultimoErro: string | null
  cancelado: boolean
  /** Resumo da última execução concluída, para a UI mostrar depois do fim. */
  mensagemFinal: string | null
}

const estado: SyncTodosAIPStatus = {
  rodando: false,
  iniciadoEm: null,
  iniciadoPor: null,
  finalizadoEm: null,
  total: 0,
  processados: 0,
  sucesso: 0,
  falhas: 0,
  atual: null,
  ultimoErro: null,
  cancelado: false,
  mensagemFinal: null,
}

let pedidoDeParada = false

export function getSyncTodosAIPStatus(): SyncTodosAIPStatus {
  return { ...estado }
}

/** Pede o cancelamento; o job para no próximo apenado, sem deixar nada pela metade. */
export function cancelarSyncTodosAIP(): boolean {
  if (!estado.rodando) return false
  pedidoDeParada = true
  console.log(`${LOG} 🛑 Cancelamento solicitado — encerrando após o apenado atual.`)
  return true
}

async function sincronizarUm(sipeId: number, unidade: string | null): Promise<void> {
  const unidadeId = unidade ? await resolveUnidadeIdByNome(unidade) : '3'
  globalThis.__sipeCurrentEngine = 'python-sdk'
  globalThis.__sipeFallbackUnidade = unidadeId || '3'
  globalThis.__sipeStopFlag = false

  // Mesma estratégia da rota de sync individual: busca por nome primeiro (resolve
  // a unidade dinamicamente) e cai no acesso direto por sipeId.
  try {
    await scrapeApenadoFichaFast(sipeId, unidade, true)
  } catch (err: any) {
    if (err?.message === 'APENADO_NAO_ENCONTRADO') {
      await scrapeApenadoFichaFast(sipeId, unidade, false)
    } else {
      throw err
    }
  }
}

async function executar(): Promise<void> {
  const alvos = await prisma.aIPApenado.findMany({
    select: { sipeId: true, nome: true, unidade: true },
    orderBy: { nome: 'asc' },
  })

  estado.total = alvos.length
  console.log(`${LOG} 🔄 Iniciando sincronização de ${alvos.length} apenado(s) do AIP com o SIPE...`)

  let falhasConsecutivas = 0

  for (const [i, a] of alvos.entries()) {
    if (pedidoDeParada) {
      estado.cancelado = true
      console.log(`${LOG} 🛑 Cancelado pelo usuário em ${i}/${alvos.length}.`)
      return
    }

    // Um sync global em andamento tem prioridade sobre este job.
    if (globalThis.__sipeState?.status === 'RUNNING') {
      estado.ultimoErro = 'Sincronização global em andamento — job encerrado para não disputar a sessão do SIPE.'
      console.log(`${LOG} ⏸️ ${estado.ultimoErro}`)
      return
    }

    estado.processados = i + 1
    estado.atual = `#${a.sipeId} ${a.nome}`

    let tentativasPool = 0
    let concluido = false

    while (!concluido) {
      try {
        await sincronizarUm(a.sipeId, a.unidade)
        estado.sucesso++
        falhasConsecutivas = 0
        concluido = true
        console.log(`${LOG} [${i + 1}/${alvos.length}] ✅ #${a.sipeId} ${a.nome}`)
      } catch (err: any) {
        if (isErroTransitorioDeBanco(err)) {
          tentativasPool++
          if (tentativasPool <= MAX_TENTATIVAS_POOL) {
            const espera = BACKOFF_POOL_MS * tentativasPool
            console.warn(
              `${LOG} [${i + 1}/${alvos.length}] ⏳ Pool de conexões cheio — aguardando ${espera / 1000}s ` +
                `(tentativa ${tentativasPool}/${MAX_TENTATIVAS_POOL}). Não é erro do SIPE.`
            )
            await new Promise((r) => setTimeout(r, espera))
            continue
          }
          estado.ultimoErro = 'Pool de conexões seguiu cheio — sistema sob carga. Job encerrado; rode de novo mais tarde.'
          console.warn(`${LOG} ⏸️ ${estado.ultimoErro} Sucesso até aqui: ${estado.sucesso}.`)
          return
        }

        estado.falhas++
        estado.ultimoErro = `#${a.sipeId} ${a.nome}: ${err?.message || err}`
        falhasConsecutivas++
        concluido = true
        console.warn(`${LOG} [${i + 1}/${alvos.length}] ⚠️ ${estado.ultimoErro}`)

        if (falhasConsecutivas >= MAX_FALHAS_CONSECUTIVAS) {
          estado.ultimoErro =
            `${MAX_FALHAS_CONSECUTIVAS} falhas seguidas no SIPE — possível sessão expirada. Job abortado.`
          console.error(`${LOG} ❌ ${estado.ultimoErro}`)
          return
        }
      }
    }

    await new Promise((r) => setTimeout(r, DELAY_ENTRE_APENADOS_MS))
  }
}

/**
 * Dispara o job em background. Retorna imediatamente — acompanhe pelo status.
 */
export async function iniciarSyncTodosAIP(
  iniciadoPor: string
): Promise<{ iniciado: boolean; motivo?: string; total?: number }> {
  if (estado.rodando) {
    return { iniciado: false, motivo: 'Já existe uma sincronização em massa em andamento.' }
  }
  if (globalThis.__sipeState?.status === 'RUNNING') {
    return { iniciado: false, motivo: 'Há uma sincronização global do SIPE em andamento. Aguarde ela terminar.' }
  }

  const total = await prisma.aIPApenado.count()
  if (total === 0) {
    return { iniciado: false, motivo: 'Não há apenados no AIP para sincronizar.' }
  }

  pedidoDeParada = false
  Object.assign(estado, {
    rodando: true,
    iniciadoEm: new Date().toISOString(),
    iniciadoPor,
    finalizadoEm: null,
    total,
    processados: 0,
    sucesso: 0,
    falhas: 0,
    atual: null,
    ultimoErro: null,
    cancelado: false,
    mensagemFinal: null,
  })

  // Fire-and-forget: a rota responde na hora e a UI acompanha pelo GET.
  void (async () => {
    try {
      await executar()
    } catch (err: any) {
      estado.ultimoErro = err?.message || String(err)
      console.error(`${LOG} ❌ Erro inesperado:`, estado.ultimoErro)
    } finally {
      estado.rodando = false
      estado.finalizadoEm = new Date().toISOString()
      estado.atual = null
      estado.mensagemFinal = estado.cancelado
        ? `Cancelado. ${estado.sucesso} de ${estado.total} sincronizados.`
        : `Concluído. ${estado.sucesso} de ${estado.total} sincronizados${estado.falhas > 0 ? `, ${estado.falhas} com falha` : ''}.`
      console.log(`${LOG} 🏁 ${estado.mensagemFinal}`)
    }
  })()

  return { iniciado: true, total }
}
