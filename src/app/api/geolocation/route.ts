import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    console.warn('[API/Geo] POST: Não autenticado');
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;

  try {
    const body = await req.json();

    // Validação de coordenadas
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
      console.warn(`[API/Geo] POST: Coordenadas inválidas: lat=${body.lat}, lng=${body.lng}`);
      return NextResponse.json({ error: 'Coordenadas inválidas', success: false }, { status: 400 });
    }

    // Validação de range
    if (body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) {
      console.warn(`[API/Geo] POST: Coordenadas fora do range: lat=${body.lat}, lng=${body.lng}`);
      return NextResponse.json({ error: 'Coordenadas fora do range válido', success: false }, { status: 400 });
    }

    // Verificar se geolocalização está habilitada
    const config = await prisma.systemConfig.findUnique({ where: { key: 'geolocation_enabled' } });
    const enabled = config ? (config.value as any)?.enabled !== false : true;

    if (!enabled) {
      console.log(`[API/Geo] POST: Recurso desabilitado para ${user.email}`);
      return NextResponse.json({ success: false, message: 'Geolocalização desabilitada', disabled: true }, { status: 200 });
    }

    // Sanitizar accuracy
    const accuracy = Math.max(0, body.accuracy || 0);

    // Validar que address não ultrapasse 255 caracteres
    const address = body.address ? String(body.address).substring(0, 255) : null;

    // Criar registro de localização
    const location = await prisma.userLocation.create({
      data: {
        userId: user.id,
        lat: parseFloat(body.lat.toFixed(6)),
        lng: parseFloat(body.lng.toFixed(6)),
        accuracy: accuracy > 0 ? Math.round(accuracy) : null,
        address,
      },
    });

    // Atualizar última localização do usuário
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLocation: {
          lat: parseFloat(body.lat.toFixed(6)),
          lng: parseFloat(body.lng.toFixed(6)),
          address,
          timestamp: new Date(),
        },
      },
    }).catch(err => {
      console.warn(`[API/Geo] Erro ao atualizar lastLocation: ${err.message}`);
    });

    const logMsg = address
      ? `${address} (±${accuracy}m)`
      : `${body.lat.toFixed(4)}, ${body.lng.toFixed(4)} (±${accuracy}m)`;

    console.log(`[API/Geo] ✓ ${user.email}: ${logMsg}`);

    return NextResponse.json({ success: true, id: location.id, address });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[API/Geo] POST error: ${errorMsg}`);
    return NextResponse.json(
      { error: 'Erro ao processar localização', success: false },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    console.warn('[API/Geo] GET: Não autenticado');
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    console.warn(`[API/Geo] GET: Acesso negado para ${user.email} (role: ${user.role})`);
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const since = searchParams.get('since');
    const stats = searchParams.get('stats') === 'true';

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (since) {
      try {
        where.timestamp = { gte: new Date(since) };
      } catch {
        return NextResponse.json({ error: 'Data "since" inválida' }, { status: 400 });
      }
    }

    // Buscar localizações
    const locations = await prisma.userLocation.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      ...(userId ? {} : { take: 300 }),
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // Se stats solicitadas, calcular
    let statsData = null;
    if (stats) {
      const totalRecords = await prisma.userLocation.count({ where });

      // Usuários únicos com localização
      const uniqueUsers = await prisma.userLocation.findMany({
        where,
        distinct: ['userId'],
        select: { userId: true },
      });

      // Últimas localizações de todos os usuários
      const latestLocations = await prisma.user.findMany({
        where: { lastLocation: { not: Prisma.DbNull } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          lastLocation: true,
        },
      });

      statsData = {
        totalRecords,
        uniqueUsersTracked: uniqueUsers.length,
        usersWithLocation: latestLocations.length,
        recentUsers: latestLocations.slice(0, 20).map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          lastLocation: u.lastLocation,
        })),
      };

      console.log(`[API/Geo] Stats: ${totalRecords} registros, ${uniqueUsers.length} usuários`);
    }

    const logMsg = userId
      ? `User trail: ${locations.length} pontos`
      : `Overview: ${locations.length} pontos de ${locations.length > 0 ? new Set(locations.map(l => l.userId)).size : 0} usuários`;

    console.log(`[API/Geo] GET: ${logMsg}`);

    return NextResponse.json({
      locations,
      ...(statsData && { stats: statsData }),
      count: locations.length,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[API/Geo] GET error: ${errorMsg}`);
    return NextResponse.json(
      { error: 'Erro ao buscar localizações' },
      { status: 500 }
    );
  }
}
