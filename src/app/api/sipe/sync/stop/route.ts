import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stopSipeJob, getSipeState } from '@/lib/sipe-scraper'

export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  stopSipeJob()

  const state = getSipeState()
  if (state?.jobId) {
    // Scraper ativo em memória: atualiza pelo jobId específico
    await prisma.sipeSyncJob.update({
      where: { id: state.jobId },
      data: {
        status: 'INTERRUPTED',
        finalizadoEm: new Date(),
        log: 'Interrompido pelo usuário via botão de parada',
      },
    }).catch(() => {})
  } else {
    // Sem estado em memória (job stale / processo reiniciado):
    // marca qualquer RUNNING ou PENDING como INTERRUPTED
    await prisma.sipeSyncJob.updateMany({
      where: { status: { in: ['RUNNING', 'PENDING'] } },
      data: {
        status: 'INTERRUPTED',
        finalizadoEm: new Date(),
        log: 'Interrompido pelo usuário via botão de parada',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
