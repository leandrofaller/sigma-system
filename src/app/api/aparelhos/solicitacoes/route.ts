import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const user = session.user as any
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN'

  try {
    if (isAdmin) {
      // Admins buscam todas as solicitações de edição pendentes no sistema
      const solicitacoes = await prisma.aparelhoApreendido.findMany({
        where: {
          statusEdicao: 'SOLICITADA',
        },
        orderBy: {
          updatedAt: 'desc',
        },
      })
      return NextResponse.json(solicitacoes)
    } else {
      // Operadores comuns buscam apenas as suas próprias solicitações de edição
      const solicitacoes = await prisma.aparelhoApreendido.findMany({
        where: {
          criadoPorId: user.id,
          statusEdicao: { in: ['SOLICITADA', 'LIBERADA'] }
        },
        orderBy: {
          updatedAt: 'desc',
        },
      })
      return NextResponse.json(solicitacoes)
    }
  } catch (error: any) {
    console.error('Error fetching edit requests:', error)
    return NextResponse.json({ error: 'Erro ao buscar solicitações' }, { status: 500 })
  }
}
