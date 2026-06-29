import { prisma } from '@/lib/db'
import { faccaoDisplay } from '@/lib/mapa-faccoes'
import { nomeParaIbge } from '@/lib/municipios-rondonia'
import { normalizeSearch } from '@/lib/search'
import { inferMunicipioForMapa } from '@/lib/unidades-enderecos-resolver'

export const MAPA_ORIGEM_MANUAL = 'MANUAL'
export const MAPA_ORIGEM_AIP_AUTO = 'AIP_AUTO'

type AipGeoSource = {
  cidade?: string | null
  uf?: string | null
  naturalidade?: string | null
  unidade?: string | null
  faccao?: string | null
  facaoRealNome?: string | null
  ativo?: boolean
}

export function isAipFaccionado(ap: AipGeoSource): boolean {
  const f = faccaoDisplay(ap)
  const n = normalizeSearch(f)
  return n.length > 0 && n !== 'NAO IDENTIFICADO' && n !== 'NONE'
}

/** @deprecated Use inferMunicipioForMapa — mantido para compatibilidade. */
export function inferMunicipioFromAip(ap: AipGeoSource): string | null {
  return inferMunicipioForMapa(ap)?.municipio ?? null
}

export interface SyncMapaFromAipResult {
  synced: boolean
  reason?: 'dados_insuficientes' | 'manual_existente' | 'inativo'
  municipio?: string
  unidade?: string
}

/**
 * Sincroniza um apenado AIP → vínculo geográfico no mapa (sem duplicar cadastro AIP).
 * Vínculos MANUAL têm prioridade; AIP_AUTO é recriado quando dados mudam.
 */
export async function syncMapaVinculoFromAip(
  aipApenadoId: string,
  cadastradoPor: string
): Promise<SyncMapaFromAipResult> {
  const ap = await prisma.aIPApenado.findUnique({ where: { id: aipApenadoId } })
  if (!ap || ap.ativo === false) {
    await prisma.mapaFaccaoVinculo.deleteMany({
      where: { aipApenadoId, origem: MAPA_ORIGEM_AIP_AUTO },
    })
    return { synced: false, reason: 'inativo' }
  }

  const inferido = inferMunicipioForMapa(ap)
  const municipio = inferido?.municipio ?? null
  const unidade = ap.unidade?.trim() || null

  if (!municipio || !unidade || !isAipFaccionado(ap)) {
    await prisma.mapaFaccaoVinculo.deleteMany({
      where: { aipApenadoId, origem: MAPA_ORIGEM_AIP_AUTO },
    })
    return { synced: false, reason: 'dados_insuficientes' }
  }

  const ibge = nomeParaIbge(municipio)

  const manualExists = await prisma.mapaFaccaoVinculo.findFirst({
    where: {
      aipApenadoId,
      municipio,
      unidadePrisional: unidade,
      origem: MAPA_ORIGEM_MANUAL,
    },
  })
  if (manualExists) {
    await prisma.mapaFaccaoVinculo.deleteMany({
      where: { aipApenadoId, origem: MAPA_ORIGEM_AIP_AUTO },
    })
    return { synced: false, reason: 'manual_existente', municipio, unidade }
  }

  await prisma.$transaction(async (tx) => {
    await tx.mapaFaccaoVinculo.deleteMany({
      where: { aipApenadoId, origem: MAPA_ORIGEM_AIP_AUTO },
    })

    const dup = await tx.mapaFaccaoVinculo.findUnique({
      where: {
        aipApenadoId_municipio_unidadePrisional: {
          aipApenadoId,
          municipio,
          unidadePrisional: unidade,
        },
      },
    })
    if (dup) return

    await tx.mapaFaccaoVinculo.create({
      data: {
        municipio,
        municipioIbge: ibge,
        unidadePrisional: unidade,
        aipApenadoId,
        origem: MAPA_ORIGEM_AIP_AUTO,
        observacoes: inferido?.via === 'unidade'
          ? 'Sincronizado do AIP (município inferido pela unidade prisional)'
          : 'Sincronizado automaticamente do AIP',
        cadastradoPor,
      },
    })
  })

  return { synced: true, municipio, unidade }
}

/** Sincronização em lote de todos os apenados AIP elegíveis. */
export async function syncAllAipToMapa(
  cadastradoPor: string,
  opts?: { limit?: number; cursor?: string }
): Promise<{ processed: number; synced: number; skipped: number; nextCursor: string | null }> {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 200))
  const cursor = opts?.cursor ?? ''

  const apenados = await prisma.aIPApenado.findMany({
    where: {
      ativo: true,
      unidade: { not: null },
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    select: {
      id: true,
      cidade: true,
      uf: true,
      naturalidade: true,
      unidade: true,
      faccao: true,
      facaoRealNome: true,
      ativo: true,
    },
    orderBy: { id: 'asc' },
    take: limit,
  })

  let synced = 0
  let skipped = 0

  for (const ap of apenados) {
    const r = await syncMapaVinculoFromAip(ap.id, cadastradoPor)
    if (r.synced) synced++
    else skipped++
  }

  const nextCursor = apenados.length === limit ? apenados[apenados.length - 1].id : null
  return { processed: apenados.length, synced, skipped, nextCursor }
}

/** Fire-and-forget seguro para hooks de API. */
export function syncMapaFromAipAsync(aipApenadoId: string, userId: string): void {
  syncMapaVinculoFromAip(aipApenadoId, userId).catch((err) => {
    console.error('[mapa-faccoes-aip-sync]', aipApenadoId, err)
  })
}