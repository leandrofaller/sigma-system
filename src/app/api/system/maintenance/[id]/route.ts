import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * PUT /api/system/maintenance/:id
 * Edita aviso de manutenção (apenas SUPER_ADMIN)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Apenas SuperAdmin pode editar avisos' },
        { status: 403 }
      )
    }

    const { title, message, severity, status, graceTimeUntil } = await req.json()

    const updateData: Record<string, any> = {}
    if (title) updateData.title = title.trim()
    if (message) updateData.message = message.trim()
    if (severity) updateData.severity = severity
    if (status) updateData.status = status

    if (graceTimeUntil !== undefined) {
      if (graceTimeUntil === null) {
        updateData.graceTimeUntil = null
      } else {
        const date = new Date(graceTimeUntil)
        if (isNaN(date.getTime())) {
          return NextResponse.json(
            { error: 'Grace time inválido' },
            { status: 400 }
          )
        }
        updateData.graceTimeUntil = date
      }
    }

    const maintenance = await prisma.systemMaintenance.update({
      where: { id: params.id },
      data: updateData,
      include: {
        createdByUser: { select: { name: true, email: true } },
      },
    })

    console.log(`[Maintenance] Aviso ${params.id} editado por ${session.user.name}`)

    return NextResponse.json({ maintenance })
  } catch (err: any) {
    console.error('[Maintenance] PUT error:', err)

    if (err?.code === 'P2025') {
      return NextResponse.json({ error: 'Aviso não encontrado' }, { status: 404 })
    }

    return NextResponse.json(
      { error: 'Erro ao editar aviso de manutenção' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/system/maintenance/:id
 * Deleta aviso de manutenção (apenas SUPER_ADMIN)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Apenas SuperAdmin pode deletar avisos' },
        { status: 403 }
      )
    }

    await prisma.systemMaintenance.delete({
      where: { id: params.id },
    })

    console.log(`[Maintenance] Aviso ${params.id} deletado por ${session.user.name}`)

    return NextResponse.json({ message: 'Aviso deletado' })
  } catch (err: any) {
    console.error('[Maintenance] DELETE error:', err)

    if (err?.code === 'P2025') {
      return NextResponse.json({ error: 'Aviso não encontrado' }, { status: 404 })
    }

    return NextResponse.json(
      { error: 'Erro ao deletar aviso de manutenção' },
      { status: 500 }
    )
  }
}
