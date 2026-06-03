import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/monitoring/locations
 * Retorna dados para o dashboard de monitoramento de localização
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

  let locations: any[] = [];
  let allUsers: any[] = [];
  let tablesMissing = false;
  let onlineUsers: any[] = [];

  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [locs, users, online] = await Promise.all([
      prisma.userLocation.findMany({
        orderBy: { timestamp: 'desc' },
        take: 500,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
      prisma.user.findMany({
        where: { isActive: true, lastSeenAt: { gte: fiveMinAgo } },
        select: { id: true, name: true, email: true, lastSeenAt: true },
        orderBy: { lastSeenAt: 'desc' },
      }),
    ]);
    locations = locs;
    allUsers = users;
    onlineUsers = online;
  } catch (err: any) {
    const msg: string = err?.message ?? '';
    const isTableMissing =
      err?.code === 'P2021' ||
      err?.meta?.code === '42P01' || // PostgreSQL: relation does not exist
      msg.includes('does not exist') ||
      msg.includes('relation') ||
      msg.includes('user_locations');
    if (isTableMissing) {
      tablesMissing = true;
    } else {
      console.error('[Monitoring] Error fetching locations:', err);
      return NextResponse.json(
        { error: 'Erro ao buscar dados de localização' },
        { status: 500 }
      );
    }
  }

  // Serialize dates
  const serialized = locations.map((l) => ({
    ...l,
    timestamp: l.timestamp.toISOString(),
  }));

  return NextResponse.json({
    locations: serialized,
    allUsers,
    onlineUsers: onlineUsers.map((u) => ({
      ...u,
      lastSeenAt: u.lastSeenAt?.toISOString(),
    })),
    tablesMissing,
  });
}
