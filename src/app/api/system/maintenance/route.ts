import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
// Note: auth() is a server function, only use in GET/POST

/**
 * GET /api/system/maintenance
 * Retorna o aviso de manutenção ativo (público) ou todos se admin
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const showAll = searchParams.has('all')

    if (showAll) {
      // Apenas admin pode ver todos
      const session = await auth()
      if (!session?.user?.id || (session.user as any).role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { error: 'Não autorizado' },
          { status: 401 }
        )
      }

      const maintenance = await prisma.systemMaintenance.findMany({
        select: {
          id: true,
          title: true,
          message: true,
          severity: true,
          status: true,
          graceTimeUntil: true,
          createdAt: true,
          createdByUser: {
            select: { name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return NextResponse.json({ maintenance })
    }

    // Retornar apenas aviso ativo (público)
    const maintenance = await prisma.systemMaintenance.findFirst({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        title: true,
        message: true,
        severity: true,
        graceTimeUntil: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ maintenance })
  } catch (err) {
    console.error('[Maintenance] GET error:', err)
    return NextResponse.json(
      { error: 'Erro ao buscar aviso de manutenção' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/system/maintenance
 * Cria novo aviso de manutenção (apenas SUPER_ADMIN)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Apenas SuperAdmin pode criar avisos' },
        { status: 403 }
      )
    }

    const { title, message, severity = 'WARNING', graceTimeUntil } = await req.json()

    if (!title || !message) {
      return NextResponse.json(
        { error: 'Título e mensagem são obrigatórios' },
        { status: 400 }
      )
    }

    // Verificar se graceTimeUntil é válido se fornecido
    let graceTime = null
    if (graceTimeUntil) {
      const date = new Date(graceTimeUntil)
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: 'Grace time inválido' },
          { status: 400 }
        )
      }
      graceTime = date
    }

    const maintenance = await prisma.systemMaintenance.create({
      data: {
        title: title.trim(),
        message: message.trim(),
        severity,
        status: 'ACTIVE',
        graceTimeUntil: graceTime,
        createdBy: (session.user as any).id,
      },
      include: {
        createdByUser: { select: { name: true, email: true } },
      },
    })

    console.log(`[Maintenance] Aviso criado por ${session.user.name}: ${title}`)

    return NextResponse.json({ maintenance }, { status: 201 })
  } catch (err) {
    console.error('[Maintenance] POST error:', err)
    return NextResponse.json(
      { error: 'Erro ao criar aviso de manutenção' },
      { status: 500 }
    )
  }
}
