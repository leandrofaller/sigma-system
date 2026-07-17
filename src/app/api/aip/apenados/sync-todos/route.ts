import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  iniciarSyncTodosAIP,
  getSyncTodosAIPStatus,
  cancelarSyncTodosAIP,
} from '@/lib/aip-sync-todos'

/**
 * Sincronização em massa dos apenados do AIP com o SIPE. Exclusivo de SUPER_ADMIN.
 *
 *   POST   -> dispara o job em background e responde na hora
 *   GET    -> progresso (a UI faz polling nisto)
 *   DELETE -> cancela o job em andamento
 */
async function exigirSuperAdmin() {
  const session = await auth()
  if (!session?.user) {
    return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return { erro: NextResponse.json({ error: 'Acesso restrito ao SUPER_ADMIN' }, { status: 403 }) }
  }
  return { session }
}

export async function GET() {
  const { erro } = await exigirSuperAdmin()
  if (erro) return erro

  return NextResponse.json(getSyncTodosAIPStatus())
}

export async function POST() {
  const { erro, session } = await exigirSuperAdmin()
  if (erro) return erro

  const quem = session!.user?.email || session!.user?.name || 'desconhecido'

  try {
    const r = await iniciarSyncTodosAIP(quem)
    if (!r.iniciado) {
      return NextResponse.json({ iniciado: false, motivo: r.motivo }, { status: 409 })
    }
    return NextResponse.json({
      iniciado: true,
      total: r.total,
      mensagem: `Sincronização iniciada para ${r.total} apenado(s). Acompanhe o progresso nesta tela.`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}

export async function DELETE() {
  const { erro } = await exigirSuperAdmin()
  if (erro) return erro

  const cancelado = cancelarSyncTodosAIP()
  return NextResponse.json({
    cancelado,
    mensagem: cancelado
      ? 'Cancelamento solicitado — o job encerra após o apenado atual.'
      : 'Não há sincronização em andamento.',
  })
}
