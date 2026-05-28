import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('id')

  if (jobId) {
    const job = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } })
    if (!job) return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
    return NextResponse.json(job)
  }

  const jobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(jobs)
}
