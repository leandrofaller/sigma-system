import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isUnidadeLixo } from '@/lib/unidades-lixo'
import { resolveUnidadeEndereco, municipioMapaFromUnidadeEndereco } from '@/lib/unidades-enderecos-resolver'
import { nomeParaIbge, normalizeMunicipioNome } from '@/lib/municipios-rondonia'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Apenas Superadmin pode acessar os dados isolados de unidades prisionais
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  try {
    const where = {
      sexo: { not: null },
      unidade: { not: null }
    }

    // Busca a contagem de apenados agrupada por unidade
    const statsUnidade = await prisma.sipeApenadoUnidadePrisional.groupBy({
      by: ['unidade'],
      where,
      _count: { id: true }
    })

    // Mapa para consolidar os dados por município
    // Chave: Nome do município (canônico)
    const municipiosMap = new Map<string, {
      nome: string
      ibge: number | null
      totalApenados: number
      unidades: { nome: string; quantidade: number }[]
    }>()

    let totalApenadosEstado = 0
    const unidadesMapeadasSet = new Set<string>()

    for (const item of statsUnidade) {
      const nomeUnidade = item.unidade
      if (!nomeUnidade || isUnidadeLixo(nomeUnidade)) continue

      const count = item._count.id
      totalApenadosEstado += count

      // Resolve o município da unidade prisional
      const enderecoInfo = resolveUnidadeEndereco(nomeUnidade)
      if (!enderecoInfo) {
        // Se a unidade não for mapeada, podemos acumular em "Não Mapeado" ou ignorar.
        // Vamos ignorar para fins de desenho no mapa de municípios de RO.
        continue
      }

      const municipioNome = municipioMapaFromUnidadeEndereco(enderecoInfo)
      if (!municipioNome) continue

      const municipioCanonico = normalizeMunicipioNome(municipioNome)
      const ibge = nomeParaIbge(municipioCanonico)

      if (!ibge) continue

      unidadesMapeadasSet.add(enderecoInfo.unidade)

      let munData = municipiosMap.get(municipioCanonico)
      if (!munData) {
        munData = {
          nome: municipioCanonico,
          ibge,
          totalApenados: 0,
          unidades: []
        }
        municipiosMap.set(municipioCanonico, munData)
      }

      munData.totalApenados += count
      
      // Adiciona ou soma no detalhamento das unidades daquele município
      // Algumas strings de unidades do SIPE podem mapear para a mesma unidade do catálogo
      const catalogNome = enderecoInfo.unidade
      const existUnit = munData.unidades.find(u => u.nome === catalogNome)
      if (existUnit) {
        existUnit.quantidade += count
      } else {
        munData.unidades.push({
          nome: catalogNome,
          quantidade: count
        })
      }
    }

    const municipios = Array.from(municipiosMap.values()).map(m => ({
      nome: m.nome,
      ibge: m.ibge,
      totalApenados: m.totalApenados,
      totalUnidades: m.unidades.length,
      unidades: m.unidades.sort((a, b) => b.quantidade - a.quantidade)
    })).sort((a, b) => b.totalApenados - a.totalApenados)

    const maxApenados = municipios.reduce((max, m) => Math.max(max, m.totalApenados), 0)

    return NextResponse.json({
      municipios,
      maxApenados: Math.max(1, maxApenados),
      totalApenadosEstado,
      totalUnidadesEstado: unidadesMapeadasSet.size
    })
  } catch (error) {
    console.error('Erro ao gerar dados do mapa de unidades prisionais:', error)
    return NextResponse.json(
      { error: 'Erro interno ao carregar dados do mapa' },
      { status: 500 }
    )
  }
}
