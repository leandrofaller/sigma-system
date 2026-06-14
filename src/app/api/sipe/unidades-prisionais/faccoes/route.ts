import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const withCount = searchParams.get('withCount') === 'true'

  const faccoes = await prisma.sipeFaccao.findMany({
    orderBy: { nome: 'asc' },
    include: withCount
      ? { _count: { select: { apenadosUnidades: true } } }
      : undefined,
  })

  const mappedFaccoes = (faccoes as any[]).map(f => {
    if (withCount && f._count) {
      return {
        ...f,
        _count: {
          apenados: f._count.apenadosUnidades
        }
      }
    }
    return f
  })

  return NextResponse.json(mappedFaccoes)
}
