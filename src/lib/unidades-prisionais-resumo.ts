import { prisma } from '@/lib/db'
import { nomeParaIbge } from '@/lib/municipios-rondonia'
import { geoMapaFromUnidadeEndereco, resolveUnidadeEndereco } from '@/lib/unidades-enderecos-resolver'

export interface ApenadosMunicipioUnidadesPrisionais {
  municipio: string
  municipioIbge: number | null
  totalApenados: number
}

/** Total de apenados por município a partir da tabela isolada de Unidades Prisionais (SIAIP). */
export async function buildApenadosUnidadesPrisionaisPorMunicipio(): Promise<ApenadosMunicipioUnidadesPrisionais[]> {
  const statsUnidade = await prisma.sipeApenadoUnidadePrisional.groupBy({
    by: ['unidade'],
    where: { sexo: { not: null } },
    _count: { id: true },
  })

  const munMap = new Map<string, ApenadosMunicipioUnidadesPrisionais>()

  for (const item of statsUnidade) {
    const unidade = item.unidade
    if (!unidade?.trim()) continue

    const entry = resolveUnidadeEndereco(unidade)
    if (!entry) continue

    const geo = geoMapaFromUnidadeEndereco(entry)
    if (!geo.municipio) continue

    const key = String(geo.municipioIbge ?? geo.municipio)
    let row = munMap.get(key)
    if (!row) {
      row = {
        municipio: geo.municipio,
        municipioIbge: geo.municipioIbge ?? nomeParaIbge(geo.municipio),
        totalApenados: 0,
      }
      munMap.set(key, row)
    }
    row.totalApenados += item._count.id
  }

  return [...munMap.values()].sort((a, b) => b.totalApenados - a.totalApenados)
}