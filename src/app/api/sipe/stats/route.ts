import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const [
    totalApenados,
    totalAdvogados,
    totalFaccoes,
    totalVinculosAdv,
    totalVinculosVis,
    totalAlcunhas,
    totalProcessos,
    apenadosPorFaccao,
    apenadosPorRegime,
    apenadosPorSituacao,
    ultimaSync,
  ] = await Promise.all([
    prisma.sipeApenadoImportado.count(),
    prisma.sipeAdvogado.count(),
    prisma.sipeFaccao.count(),
    prisma.sipeVinculoAdvogado.count({ where: { ativo: true } }),
    prisma.sipeVinculoVisitante.count({ where: { ativo: true } }),
    prisma.sipeAlcunha.count(),
    prisma.sipeProcesso.count(),

    // Breakdown by faction
    prisma.sipeApenadoImportado.groupBy({
      by: ['faccaoId'],
      _count: { _all: true },
      where: { faccaoId: { not: null } },
    }),

    // Breakdown by regime
    prisma.sipeApenadoImportado.groupBy({
      by: ['regime'],
      _count: { _all: true },
      where: { regime: { not: null } },
    }),

    // Breakdown by situation
    prisma.sipeApenadoImportado.groupBy({
      by: ['situacao'],
      _count: { _all: true },
      where: { situacao: { not: null } },
    }),

    // Last successful sync
    prisma.sipeSyncJob.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { finalizadoEm: 'desc' },
      select: { finalizadoEm: true, unidadeNome: true, processado: true },
    }),
  ])

  // Enrich faction breakdown with names
  const faccaoIds = apenadosPorFaccao
    .map((g) => g.faccaoId)
    .filter(Boolean) as string[]

  const faccoes = faccaoIds.length
    ? await prisma.sipeFaccao.findMany({
        where: { id: { in: faccaoIds } },
        select: { id: true, nome: true, sigla: true, cor: true },
      })
    : []

  const faccaoMap = Object.fromEntries(faccoes.map((f) => [f.id, f]))

  const porFaccao = apenadosPorFaccao
    .map((g) => ({
      faccaoId: g.faccaoId,
      nome: faccaoMap[g.faccaoId!]?.nome ?? 'Desconhecida',
      sigla: faccaoMap[g.faccaoId!]?.sigla ?? null,
      cor: faccaoMap[g.faccaoId!]?.cor ?? '#ef4444',
      total: (g._count as { _all: number })._all,
    }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    totais: {
      apenados: totalApenados,
      advogados: totalAdvogados,
      faccoes: totalFaccoes,
      vinculosAdvogados: totalVinculosAdv,
      vinculosVisitantes: totalVinculosVis,
      alcunhas: totalAlcunhas,
      processos: totalProcessos,
    },
    porFaccao,
    porRegime: apenadosPorRegime.map((g) => ({
      regime: g.regime,
      total: (g._count as { _all: number })._all,
    })).sort((a, b) => b.total - a.total).slice(0, 10),
    porSituacao: apenadosPorSituacao.map((g) => ({
      situacao: g.situacao,
      total: (g._count as { _all: number })._all,
    })).sort((a, b) => b.total - a.total),
    ultimaSync,
  })
}
