import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'OPERATOR' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'ID do vínculo é obrigatório' }, { status: 400 })
    }

    const vinculo = await prisma.aIPVinculo.findUnique({
      where: { id }
    })

    if (!vinculo) {
      return NextResponse.json({ error: 'Vínculo não encontrado' }, { status: 404 })
    }

    await prisma.aIPVinculo.delete({
      where: { id }
    })

    return NextResponse.json({ success: true, message: 'Vínculo deletado com sucesso' })
  } catch (error) {
    console.error('[AIP] Erro ao deletar vínculo:', error)
    return NextResponse.json({ error: 'Erro ao processar requisição' }, { status: 500 })
  }
}
