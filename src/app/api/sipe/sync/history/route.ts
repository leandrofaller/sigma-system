import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * DELETE /api/sipe/sync/history
 * Remove todos os registros de histórico finalizados (COMPLETED, FAILED, INTERRUPTED).
 * Jobs ativos (RUNNING, PENDING) nunca são removidos.
 * Exclusivo para SUPER_ADMIN.
 */
export async function DELETE() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  const result = await prisma.sipeSyncJob.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED', 'INTERRUPTED'] },
    },
  })

  return NextResponse.json({ deletados: result.count })
}
