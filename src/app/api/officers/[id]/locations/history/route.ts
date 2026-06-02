import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/officers/:id/locations/history
 * Retorna histórico de localizações de um policial (apenas SUPER_ADMIN)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const limit = parseInt(searchParams.get('limit') || '1000')

    // Calcular data inicial
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Registrar auditoria
    await prisma.locationAudit.create({
      data: {
        adminId: session.user.id,
        officerId: params.id,
        action: 'VIEW_LOCATION_HISTORY',
        details: `Últimos ${days} dias`,
        ipAddress: req.ip || 'unknown',
      },
    })

    // Buscar histórico
    const history = await prisma.officerLocationTracking.findMany({
      where: {
        userId: params.id,
        timestamp: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        accuracy: true,
        altitude: true,
        speed: true,
        timestamp: true,
        source: true,
        batteryLevel: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    })

    // Buscar info do policial
    const officer = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        email: true,
      },
    })

    if (!officer) {
      return NextResponse.json({ error: 'Policial não encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      officer,
      count: history.length,
      period: {
        from: startDate.toISOString(),
        to: new Date().toISOString(),
        days,
      },
      history,
    })
  } catch (err) {
    console.error('[Location History] GET error:', err)
    return NextResponse.json(
      { error: 'Erro ao buscar histórico de localizações' },
      { status: 500 }
    )
  }
}
