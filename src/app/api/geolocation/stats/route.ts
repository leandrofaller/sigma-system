import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

/**
 * GET /api/geolocation/stats
 * Admin-only endpoint para monitoramento de coleta de geolocalização
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const timeRange = searchParams.get('range') || '24h'; // 24h, 7d, 30d

    // Calcular data limite
    let sinceDate = new Date();
    if (timeRange === '7d') sinceDate.setDate(sinceDate.getDate() - 7);
    else if (timeRange === '30d') sinceDate.setDate(sinceDate.getDate() - 30);
    else sinceDate.setHours(sinceDate.getHours() - 24);

    // Stats totais
    const totalRecords = await prisma.userLocation.count();
    const recentRecords = await prisma.userLocation.count({
      where: { timestamp: { gte: sinceDate } },
    });

    // Usuários com localização
    const usersWithLocation = await prisma.user.count({
      where: { lastLocation: { not: Prisma.DbNull } },
    });

    // Usuários ativos (com localização nos últimos X horas)
    const activeUsers = await prisma.userLocation.findMany({
      where: { timestamp: { gte: sinceDate } },
      distinct: ['userId'],
      select: { userId: true },
    });

    // Localização média por usuário
    const avgPerUser = activeUsers.length > 0
      ? Math.round(recentRecords / activeUsers.length)
      : 0;

    // Usuários mais ativos
    const topUsers = await prisma.userLocation.groupBy({
      by: ['userId'],
      where: { timestamp: { gte: sinceDate } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    // Buscar detalhes dos top users
    const topUserDetails = await Promise.all(
      topUsers.map(async (tu) => {
        const userData = await prisma.user.findUnique({
          where: { id: tu.userId },
          select: { id: true, name: true, email: true, role: true },
        });
        return {
          ...userData,
          pointsCount: tu._count.id,
        };
      })
    );

    // Config status
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'geolocation_enabled' },
    });
    const enabled = config ? (config.value as any)?.enabled !== false : true;

    console.log(`[API/Geo/Stats] Range: ${timeRange}, Recent: ${recentRecords}, Active users: ${activeUsers.length}`);

    return NextResponse.json({
      enabled,
      timeRange,
      stats: {
        totalRecords,
        recentRecords,
        usersWithLocation,
        activeUsersInRange: activeUsers.length,
        avgPointsPerUser: avgPerUser,
        topUsers: topUserDetails,
      },
      health: {
        isHealthy: recentRecords > 0 && activeUsers.length > 0,
        lastUpdate: recentRecords > 0 ? 'OK' : 'No recent data',
        activeCount: activeUsers.length,
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[API/Geo/Stats] Error: ${errorMsg}`);
    return NextResponse.json(
      { error: 'Erro ao buscar estatísticas' },
      { status: 500 }
    );
  }
}
