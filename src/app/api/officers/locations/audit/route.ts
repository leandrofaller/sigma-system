import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/officers/locations/audit
 * Retorna log de auditoria de acessos a localizações (apenas SUPER_ADMIN)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userRole = (session.user as any)?.role
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '7')
    const limit = parseInt(searchParams.get('limit') || '500')

    // Calcular data inicial
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Buscar auditoria
    const audits = await prisma.locationAudit.findMany({
      where: {
        timestamp: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        adminId: true,
        admin: {
          select: {
            name: true,
            email: true,
          },
        },
        officerId: true,
        officer: {
          select: {
            name: true,
            email: true,
          },
        },
        action: true,
        details: true,
        ipAddress: true,
        timestamp: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    })

    // Agrupar por ação
    const byAction: Record<string, number> = {}
    audits.forEach((a) => {
      byAction[a.action] = (byAction[a.action] || 0) + 1
    })

    return NextResponse.json({
      count: audits.length,
      period: {
        from: startDate.toISOString(),
        to: new Date().toISOString(),
        days,
      },
      byAction,
      audits,
    })
  } catch (err) {
    console.error('[Location Audit] GET error:', err)
    return NextResponse.json(
      { error: 'Erro ao buscar auditoria' },
      { status: 500 }
    )
  }
}
