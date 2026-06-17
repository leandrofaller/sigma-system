import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  // 1. Buscar os sipeId (Int) dos apenados AIP e mapear para o id (cuid) do SipeApenadoImportado
  //    SipeVinculoAdvogado e SipeProcesso usam apenadoId (cuid), não sipeId (Int)
  const aipEntries = await prisma.aIPApenado.findMany({
    select: { sipeApenadoId: true },
  })
  const sipeIntIds = aipEntries
    .map((a) => a.sipeApenadoId)
    .filter((id): id is number => id !== null)

  // Buscar os cuid ids correspondentes em SipeApenadoImportado
  const sipeRegistros = sipeIntIds.length > 0
    ? await prisma.sipeApenadoImportado.findMany({
        where: { sipeId: { in: sipeIntIds } },
        select: { id: true },
      })
    : []
  const sipeCuidIds = sipeRegistros.map((r) => r.id)

  const [
    totalApenados,
    totalFaccoes,
    vinculosAdvogadosRaw,
    totalVulgos,
    totalProcessos,
    totalVisitantes,
    porFaccaoRaw,
    porRegimeRaw,
    porSituacaoRaw,
  ] = await Promise.all([
    // Total de apenados no AIP
    prisma.aIPApenado.count(),

    // Facções identificadas (inteligência AIP — facaoRealNome distinto)
    prisma.aIPApenado.findMany({
      where: {
        AND: [
          { facaoRealNome: { not: null } },
          { facaoRealNome: { not: '' } },
        ],
      },
      select: { facaoRealNome: true },
      distinct: ['facaoRealNome'],
    }).then((r) => r.length),

    // Vínculos de advogados (ativos) para os apenados AIP
    sipeCuidIds.length > 0
      ? prisma.sipeVinculoAdvogado.findMany({
          where: { apenadoId: { in: sipeCuidIds }, ativo: true },
          select: { advogadoId: true },
        })
      : Promise.resolve([]),

    // Vulgos registrados (equivalente a alcunhas)
    prisma.aIPApenado.count({
      where: {
        AND: [
          { vulgo: { not: null } },
          { vulgo: { not: '' } },
        ],
      },
    }),

    // Processos criminais dos apenados AIP (via apenadoId cuid)
    sipeCuidIds.length > 0
      ? prisma.sipeProcesso.count({ where: { apenadoId: { in: sipeCuidIds } } })
      : Promise.resolve(0),

    // Fotos de visitantes cadastradas em AIP
    prisma.aIPFotoVisitante.count(),

    // Breakdown por facção real (inteligência AIP)
    prisma.aIPApenado.groupBy({
      by: ['facaoRealNome'],
      where: {
        AND: [
          { facaoRealNome: { not: null } },
          { facaoRealNome: { not: '' } },
        ],
      },
      _count: { _all: true },
    }),

    // Breakdown por regime
    prisma.aIPApenado.groupBy({
      by: ['regime'],
      where: { regime: { not: null } },
      _count: { _all: true },
    }),

    // Breakdown por situação
    prisma.aIPApenado.groupBy({
      by: ['situacao'],
      where: { situacao: { not: null } },
      _count: { _all: true },
    }),
  ])

  // Calcular advogados únicos e total de vínculos
  const advogadoIds = new Set(vinculosAdvogadosRaw.map((v) => v.advogadoId))
  const totalAdvogados = advogadoIds.size
  const totalVinculosAdvogados = vinculosAdvogadosRaw.length

  // Enriquecer facções com cores do SipeFaccao (busca por nome)
  const nomesUnicos = porFaccaoRaw.map((g) => g.facaoRealNome!).filter(Boolean)
  const faccoesSipe =
    nomesUnicos.length > 0
      ? await prisma.sipeFaccao.findMany({
          where: { nome: { in: nomesUnicos } },
          select: { nome: true, sigla: true, cor: true },
        })
      : []
  const faccaoMap = Object.fromEntries(faccoesSipe.map((f) => [f.nome, f]))

  const porFaccao = porFaccaoRaw
    .map((g) => ({
      nome: g.facaoRealNome!,
      sigla: faccaoMap[g.facaoRealNome!]?.sigla ?? null,
      cor: faccaoMap[g.facaoRealNome!]?.cor ?? '#9ca3af',
      total: (g._count as { _all: number })._all,
    }))
    .sort((a, b) => b.total - a.total)

  const porRegime = porRegimeRaw
    .map((g) => ({ regime: g.regime, total: (g._count as { _all: number })._all }))
    .sort((a, b) => b.total - a.total)

  const porSituacao = porSituacaoRaw
    .map((g) => ({ situacao: g.situacao, total: (g._count as { _all: number })._all }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    totais: {
      apenados: totalApenados,
      faccoes: totalFaccoes,
      advogados: totalAdvogados,
      vinculosAdvogados: totalVinculosAdvogados,
      vulgos: totalVulgos,
      processos: totalProcessos,
      visitantes: totalVisitantes,
    },
    porFaccao,
    porRegime,
    porSituacao,
  })
}
