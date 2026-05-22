import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const body = await req.json();
  const { lat, lng, address } = body as { lat: number; lng: number; address?: string };

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('sigma-device')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Dispositivo não identificado' }, { status: 400 });
  }

  const device = await prisma.userDevice.findUnique({ where: { token } });

  if (!device || device.userId !== session.user.id) {
    return NextResponse.json({ error: 'Dispositivo não encontrado' }, { status: 404 });
  }

  await prisma.userDevice.update({
    where: { token },
    data: {
      latitude: lat,
      longitude: lng,
      locationAddress: address ?? null,
      locationAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
