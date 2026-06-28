import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildMapaStats } from '@/lib/mapa-faccoes-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    const stats = await buildMapaStats()
    const topMunicipios = stats.municipios.slice(0, 15)
    const topUnidades = stats.unidades.slice(0, 20)
    const faccoesRanking = Object.entries(stats.totais.faccoes)
      .sort((a, b) => b[1] - a[1])
      .map(([nome, total]) => ({ nome, total }))

    return NextResponse.json({
      titulo: 'Relatório de Atuação de Facções — Rondônia',
      subtitulo: 'Sistema de Inteligência Penitenciária — SEJUS/RO',
      geradoEm: stats.geradoEm,
      resumo: {
        totalVinculos: stats.totais.vinculos,
        municipiosAfetados: stats.totais.municipiosComDados,
        unidadesComFaccionados: stats.totais.unidadesComDados,
        faccoesIdentificadas: faccoesRanking.length,
      },
      topMunicipios,
      topUnidades,
      faccoesRanking,
      municipios: stats.municipios,
      unidades: stats.unidades,
    })
  } catch (e) {
    console.error('[mapa-faccoes/relatorio]', e)
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 })
  }
}