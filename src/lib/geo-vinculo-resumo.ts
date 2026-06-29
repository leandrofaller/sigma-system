import { prisma } from '@/lib/db'
import { matchesMunicipio } from '@/lib/municipio-match'
import { fetchMapaVinculosComAip, formatVinculo } from '@/lib/mapa-faccoes-service'
import { UNIDADES_ENDERECOS_RO } from '@/lib/unidades-enderecos-ro'
import {
  geoMapaFromUnidadeEndereco,
  resolveUnidadeEndereco,
  unidadeCorrespondeCatalogo,
} from '@/lib/unidades-enderecos-resolver'

export interface GeoResumoUnidade {
  unidadeId: string
  unidadeNome: string
  comarca: string
  municipio: string | null
  municipioIbge: number | null
  vinculosMapa: number
  apenadosAip: number
}

export interface GeoResumoMunicipio {
  municipio: string
  municipioIbge: number | null
  comarcas: string[]
  vinculosMapa: number
  apenadosAip: number
}

export async function buildGeoVinculoResumo() {
  const [vinculosRaw, apenadosAip] = await Promise.all([
    fetchMapaVinculosComAip(),
    prisma.aIPApenado.findMany({
      where: { ativo: true, unidade: { not: null } },
      select: {
        id: true,
        nome: true,
        sipeId: true,
        unidade: true,
        faccao: true,
        facaoRealNome: true,
        vulgo: true,
        photoPath: true,
      },
    }),
  ])

  const porUnidade: GeoResumoUnidade[] = UNIDADES_ENDERECOS_RO.map((entry) => {
    const geo = geoMapaFromUnidadeEndereco(entry)
    const vinculosUnit = vinculosRaw.filter((v) => unidadeCorrespondeCatalogo(v.unidadePrisional, entry))
    const apenados = apenadosAip.filter((a) => unidadeCorrespondeCatalogo(a.unidade, entry))

    return {
      unidadeId: entry.id,
      unidadeNome: entry.unidade,
      comarca: entry.comarca,
      municipio: geo.municipio,
      municipioIbge: geo.municipioIbge,
      vinculosMapa: vinculosUnit.length,
      apenadosAip: apenados.length,
    }
  })

  const munMap = new Map<string, GeoResumoMunicipio>()
  for (const u of porUnidade) {
    if (!u.municipio) continue
    const key = String(u.municipioIbge ?? u.municipio)
    let m = munMap.get(key)
    if (!m) {
      m = {
        municipio: u.municipio,
        municipioIbge: u.municipioIbge,
        comarcas: [],
        vinculosMapa: 0,
        apenadosAip: 0,
      }
      munMap.set(key, m)
    }
    if (!m.comarcas.includes(u.comarca)) m.comarcas.push(u.comarca)
    m.vinculosMapa += u.vinculosMapa
    m.apenadosAip += u.apenadosAip
  }

  return {
    porUnidade,
    porMunicipio: [...munMap.values()].sort((a, b) => b.vinculosMapa - a.vinculosMapa),
    geradoEm: new Date().toISOString(),
  }
}

export async function fetchVinculosMapaPorGeo(opts: {
  municipio?: string
  ibge?: number | null
  unidadeId?: string
  unidadeAip?: string
  limit?: number
}) {
  const vinculosRaw = await fetchMapaVinculosComAip()
  let list = vinculosRaw

  if (opts.unidadeId) {
    const entry = UNIDADES_ENDERECOS_RO.find((u) => u.id === opts.unidadeId)
    if (entry) {
      list = list.filter((v) => unidadeCorrespondeCatalogo(v.unidadePrisional, entry))
    }
  } else if (opts.unidadeAip) {
    const entry = resolveUnidadeEndereco(opts.unidadeAip)
    if (entry) {
      list = list.filter((v) => unidadeCorrespondeCatalogo(v.unidadePrisional, entry))
    }
  }

  if (opts.municipio || opts.ibge != null) {
    list = list.filter((v) => matchesMunicipio(v, opts.municipio ?? '', opts.ibge))
  }

  const limit = Math.min(100, Math.max(1, opts.limit ?? 50))
  return list.slice(0, limit).map(formatVinculo)
}

export function geoResumoPorUnidadeId(
  porUnidade: GeoResumoUnidade[],
  unidadeId: string
): GeoResumoUnidade | undefined {
  return porUnidade.find((u) => u.unidadeId === unidadeId)
}