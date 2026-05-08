import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const body = await req.json();

  if (!body.lat || !body.lng) {
    return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 });
  }

  const config = await prisma.systemConfig.findUnique({ where: { key: 'geolocation_enabled' } });
  const enabled = (config?.value as any)?.enabled !== false;

  if (!enabled) return NextResponse.json({ success: false, message: 'Geolocalização desabilitada' });

  const location = await prisma.userLocation.create({
    data: {
      userId: user.id,
      lat: body.lat,
      lng: body.lng,
      accuracy: body.accuracy,
      address: body.address,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLocation: { lat: body.lat, lng: body.lng, timestamp: new Date() } },
  });

  return NextResponse.json({ success: true, id: location.id });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  const locations = await prisma.userLocation.findMany({
    where: userId ? { userId } : {},
    orderBy: { timestamp: 'desc' },
    take: 200,
    include: { user: { select: { name: true, email: true } } },
  });

  return NextResponse.json(locations);
}
