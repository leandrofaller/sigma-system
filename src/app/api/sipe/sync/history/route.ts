import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * DELETE /api/sipe/sync/history?id=<jobId>
 * Remove um registro específico do histórico (por ID).
 * Ou sem ?id: remove TODOS os registros finalizados (COMPLETED, FAILED, INTERRUPTED).
 * Jobs ativos (RUNNING, PENDING) nunca são removidos.
 * Exclusivo para SUPER_ADMIN.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  // Deletar por ID específico
  const jobId = req.nextUrl.searchParams.get('id')
  if (jobId) {
    const job = await prisma.sipeSyncJob.findUnique({
      where: { id: jobId },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
    }

    // Protege jobs em execução
    if (job.status === 'RUNNING' || job.status === 'PENDING') {
      return NextResponse.json(
        { error: `Não é possível deletar job em execução (status: ${job.status})` },
        { status: 400 }
      )
    }

    // Deleta o registro
    await prisma.sipeSyncJob.delete({
      where: { id: jobId },
    })

    return NextResponse.json({
      deletado: true,
      jobId,
      status: job.status,
      message: `Job ${jobId} deletado com sucesso`
    })
  }

  // Deletar todos os finalizados (comportamento anterior)
  const result = await prisma.sipeSyncJob.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED', 'INTERRUPTED'] },
    },
  })

  return NextResponse.json({
    deletados: result.count,
    message: `${result.count} registros finalizados deletados`
  })
}
