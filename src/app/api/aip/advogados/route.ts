import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { containsNormalizedText, normalizeSearchText } from '@/lib/search'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const q = normalizeSearchText(searchParams.get('q'))

  // Buscar todos AIP apenados com vínculos de advogados
  const apenados = await prisma.aIPApenado.findMany({
    select: {
      id: true,
      nome: true,
      unidade: true,
      regime: true,
      sipeApenado: {
        select: {
          vinculosAdvogado: {
            where: { ativo: true },
            include: { advogado: true },
          },
        },
      },
    },
  })

  // Agregar advogados únicos com seus clientes AIP
  const advogadoMap = new Map<string, {
    id: string
    sipeId: number
    nome: string
    oab: string | null
    cpf: string | null
    telefone: string | null
    clientes: { id: string; nome: string; unidade: string | null; regime: string | null }[]
  }>()

  for (const apenado of apenados) {
    for (const vinculo of apenado.sipeApenado?.vinculosAdvogado ?? []) {
      const adv = vinculo.advogado
      if (!advogadoMap.has(adv.id)) {
        advogadoMap.set(adv.id, {
          id: adv.id,
          sipeId: adv.sipeId,
          nome: adv.nome,
          oab: adv.oab,
          cpf: adv.cpf,
          telefone: adv.telefone,
          clientes: [],
        })
      }
      advogadoMap.get(adv.id)!.clientes.push({
        id: apenado.id,
        nome: apenado.nome,
        unidade: apenado.unidade,
        regime: apenado.regime,
      })
    }
  }

  let advogados = Array.from(advogadoMap.values())

  // Filtro de busca
  if (q) {
    advogados = advogados.filter(
      (a) =>
        containsNormalizedText(a.nome, q) ||
        containsNormalizedText(a.oab, q) ||
        containsNormalizedText(a.cpf, q)
    )
  }

  // Ordenar por número de clientes desc
  advogados.sort((a, b) => b.clientes.length - a.clientes.length)

  return NextResponse.json({
    advogados: advogados.map((a) => ({ ...a, totalClientes: a.clientes.length })),
    total: advogados.length,
  })
}
