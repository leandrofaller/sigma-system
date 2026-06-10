import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Acesso restrito a Administradores e Superadmins' },
      { status: 403 }
    )
  }

  const { id } = params

  try {
    const advogado = await prisma.sipeAdvogado.findUnique({
      where: { id }
    })

    if (!advogado) {
      return NextResponse.json(
        { error: 'Advogado não encontrado' },
        { status: 404 }
      )
    }

    // O relacionamento com SipeVinculoAdvogado está configurado com onDelete: Cascade no schema do Prisma,
    // então a deleção do advogado excluirá automaticamente seus vínculos associados.
    await prisma.sipeAdvogado.delete({
      where: { id }
    })

    return NextResponse.json({ message: 'Advogado excluído com sucesso' })
  } catch (error: any) {
    console.error('Erro ao excluir advogado:', error)
    return NextResponse.json(
      { error: 'Erro interno ao excluir advogado' },
      { status: 500 }
    )
  }
}
