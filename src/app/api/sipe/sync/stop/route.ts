import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stopSipeJob, getSipeState } from '@/lib/sipe-scraper'

export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  stopSipeJob()

  // Update DB immediately so crash-detection doesn't re-mark it later
  const state = getSipeState()
  if (state?.jobId) {
    await prisma.sipeSyncJob.update({
      where: { id: state.jobId },
      data: {
        status: 'INTERRUPTED',
        finalizadoEm: new Date(),
        log: 'Interrompido pelo usuário via botão de parada',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
