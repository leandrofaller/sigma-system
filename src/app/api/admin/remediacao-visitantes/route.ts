import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  listarApenadosAfetados,
  runRemediacaoVisitantes,
  getRemediacaoStatus,
} from '@/lib/visitantes-homonimos-remediation'

/**
 * Status da remediação de visitantes homônimos.
 * Não depende de log nem do hook de boot — dá para conferir pelo navegador.
 *
 *   GET  /api/admin/remediacao-visitantes  → quantos apenados ainda estão afetados
 *   POST /api/admin/remediacao-visitantes  → dispara a correção em background
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  try {
    const afetados = await listarApenadosAfetados()
    const status = getRemediacaoStatus()

    return NextResponse.json({
      afetados: afetados.length,
      limpo: afetados.length === 0,
      execucao: status,
      amostra: afetados.slice(0, 10).map((a) => ({ sipeId: a.sipeId, nome: a.nome })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}

export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const status = getRemediacaoStatus()
  if (status.rodando) {
    return NextResponse.json({
      iniciado: false,
      motivo: 'Remediação já está em execução.',
      execucao: status,
    })
  }

  const afetados = await listarApenadosAfetados()
  if (afetados.length === 0) {
    return NextResponse.json({ iniciado: false, motivo: 'Nada a corrigir.', afetados: 0 })
  }

  // Dispara em background e responde na hora. Acompanhe pelo GET.
  void runRemediacaoVisitantes()

  return NextResponse.json({
    iniciado: true,
    afetados: afetados.length,
    mensagem: `Remediação iniciada para ${afetados.length} apenado(s). Consulte o GET desta mesma rota para acompanhar o progresso.`,
  })
}
