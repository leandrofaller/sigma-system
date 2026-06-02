import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * POST /api/officers/locations
 * Registra localização do policial (chamado pelo app mobile)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { latitude, longitude, accuracy, altitude, speed, deviceId, source, batteryLevel } =
      await req.json()

    // Validações básicas
    if (!latitude || !longitude) {
      return NextResponse.json(
        { error: 'Latitude e longitude são obrigatórias' },
        { status: 400 }
      )
    }

    // Verificar consentimento
    const consent = await prisma.locationConsent.findUnique({
      where: { userId: session.user.id },
    })

    if (!consent?.consentGiven) {
      return NextResponse.json(
        { error: 'Consentimento não fornecido' },
        { status: 403 }
      )
    }

    // Registrar localização
    const location = await prisma.officerLocationTracking.create({
      data: {
        userId: session.user.id,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: accuracy ? parseFloat(accuracy) : null,
        altitude: altitude ? parseFloat(altitude) : null,
        speed: speed ? parseFloat(speed) : null,
        deviceId: deviceId || null,
        source: source || 'GPS',
        batteryLevel: batteryLevel ? parseInt(batteryLevel) : null,
      },
    })

    console.log(
      `[Location] Registrado: ${session.user.id} em ${latitude},${longitude}`
    )

    return NextResponse.json({ location }, { status: 201 })
  } catch (err) {
    console.error('[Location] POST error:', err)
    return NextResponse.json({ error: 'Erro ao registrar localização' }, { status: 500 })
  }
}

/**
 * GET /api/officers/locations
 * Lista todas as localizações atuais (apenas SUPER_ADMIN)
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

    // Registrar auditoria
    await prisma.locationAudit.create({
      data: {
        adminId: session.user.id,
        officerId: '',
        action: 'VIEW_ALL_LOCATIONS_MAP',
        ipAddress: req.ip || 'unknown',
      },
    })

    // Buscar última localização de cada policial
    const locations = await prisma.officerLocationTracking.findMany({
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        latitude: true,
        longitude: true,
        accuracy: true,
        timestamp: true,
        source: true,
        batteryLevel: true,
      },
      // Pegar apenas últimas 100 localizações (GROUP BY userId)
      distinct: ['userId'],
      orderBy: {
        timestamp: 'desc',
      },
      take: 100,
    })

    return NextResponse.json({ locations })
  } catch (err) {
    console.error('[Location] GET error:', err)
    return NextResponse.json({ error: 'Erro ao buscar localizações' }, { status: 500 })
  }
}
