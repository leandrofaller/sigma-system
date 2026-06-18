import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unaccentParam } from '@/lib/search'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = unaccentParam(searchParams.get('q'))
  const unidade = unaccentParam(searchParams.get('unidade'))
  const faccao = searchParams.get('faccao') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.max(1, Math.min(500, parseInt(searchParams.get('limit') || '20')))
  const skip = (page - 1) * limit

  // Buscar todos os registros completos da tabela sipe_apenados_unidades_prisionais
  const apenados = await prisma.sipeApenadoUnidadePrisional.findMany({
    include: {
      faccao: true,
    },
  })

  // Agregar advogados em memória
  const lawyersMap = new Map<string, any>()

  for (const ap of apenados) {
    const advs = Array.isArray(ap.advogados) ? (ap.advogados as any[]) : []
    const alcunhasArray = Array.isArray(ap.alcunhas) ? (ap.alcunhas as any[]) : []

    for (const adv of advs) {
      if (!adv || !adv.id) continue

      if (!lawyersMap.has(adv.id)) {
        lawyersMap.set(adv.id, {
          id: adv.id,
          sipeId: 0,
          nome: adv.nome,
          oab: adv.oab || null,
          cpf: null,
          telefone: null,
          endereco: null,
          photoPath: null,
          dataCadastro: null,
          vinculos: [],
        })
      }

      const aggregated = lawyersMap.get(adv.id)
      aggregated.vinculos.push({
        apenado: {
          id: ap.id,
          nome: ap.nome,
          cpf: ap.cpf,
          regime: ap.regime,
          unidade: ap.unidade,
          cela: ap.cela,
          faccao: ap.faccao ? {
            id: (ap.faccao as any).id,
            nome: (ap.faccao as any).name || (ap.faccao as any).nome,
            sigla: (ap.faccao as any).sigla,
            cor: (ap.faccao as any).cor || '#ef4444',
          } : null,
          alcunhas: alcunhasArray,
        },
      })
    }
  }

  let advList = Array.from(lawyersMap.values())

  // Filtrar os vínculos de cada advogado de acordo com unidade/facção
  advList = advList.map(a => {
    let filteredVinculos = a.vinculos

    if (unidade) {
      const searchUnidade = unidade.toLowerCase()
      filteredVinculos = filteredVinculos.filter((v: any) =>
        v.apenado.unidade && v.apenado.unidade.toLowerCase().includes(searchUnidade)
      )
    }

    if (faccao) {
      if (faccao === 'qualquer') {
        filteredVinculos = filteredVinculos.filter((v: any) => v.apenado.faccao !== null)
      } else {
        filteredVinculos = filteredVinculos.filter((v: any) =>
          v.apenado.faccao && v.apenado.faccao.id === faccao
        )
      }
    }

    return { ...a, vinculos: filteredVinculos }
  })

  // Remover advogados que não têm clientes na partição filtrada
  if (unidade || faccao) {
    advList = advList.filter(a => a.vinculos.length > 0)
  }

  // Filtrar advogados por termo de pesquisa (nome/OAB)
  if (q) {
    const searchPattern = q.toLowerCase()
    advList = advList.filter(a =>
      a.nome.toLowerCase().includes(searchPattern) ||
      (a.oab && a.oab.toLowerCase().includes(searchPattern))
    )
  }

  // Ordenar alfabeticamente
  advList.sort((a, b) => a.nome.localeCompare(b.nome))

  // Paginar
  const total = advList.length
  const paginatedAdvs = advList.slice(skip, skip + limit)

  return NextResponse.json({
    advogados: paginatedAdvs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}
