import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { parseDeviceName } from '@/lib/device';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const body = await req.json();
  const { lat, lng, address } = body as { lat: number | null; lng: number | null; address?: string | null };

  const hasLocation = typeof lat === 'number' && typeof lng === 'number';
  if (!hasLocation && (lat !== null || lng !== null)) {
    return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 });
  }

  // Obter user-agent e verificar se é mobile
  const ua = req.headers.get('user-agent') || '';
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);

  if (isMobile && !hasLocation) {
    return NextResponse.json(
      { error: 'A geolocalização é obrigatória para dispositivos móveis' },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('sigma-device')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Dispositivo não identificado' }, { status: 400 });
  }

  let device = await prisma.userDevice.findUnique({ where: { token } });

  if (device && device.userId !== session.user.id) {
    return NextResponse.json({ error: 'Token pertence a outro usuário' }, { status: 403 });
  }

  const userAgent = req.headers.get('user-agent') || '';
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
                    req.headers.get('x-real-ip') ??
                    '';

  if (!device) {
    device = await prisma.userDevice.create({
      data: {
        token,
        userId: session.user.id,
        name: parseDeviceName(userAgent),
        userAgent,
        ipAddress,
        status: 'PENDING',
        latitude: hasLocation ? lat : null,
        longitude: hasLocation ? lng : null,
        locationAddress: hasLocation && address ? address : null,
        locationAt: hasLocation ? new Date() : null,
        geoPermissionDenied: !hasLocation,
      },
    });
  } else {
    await prisma.userDevice.update({
      where: { token },
      data: {
        latitude: hasLocation ? lat : null,
        longitude: hasLocation ? lng : null,
        locationAddress: hasLocation && address ? address : null,
        locationAt: hasLocation ? new Date() : null,
        geoPermissionDenied: !hasLocation,
      },
    });
  }

  if (hasLocation) {
    const geoData = {
      lat,
      lng,
      accuracy: null,
      address: address || null,
      timestamp: new Date().toISOString(),
    };

    // Atualiza geolocalização do usuário para refletir no monitoramento
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        geoStatus: 'authorized',
        geoLocationData: geoData,
        lastLocation: geoData,
      },
    });

    // Insere no histórico de localizações (user_locations)
    await prisma.userLocation.create({
      data: {
        userId: session.user.id,
        lat,
        lng,
        accuracy: null,
        address: address || null,
      },
    }).catch((err) => {
      console.warn(`[DeviceLocation] Erro ao criar histórico de localização: ${err.message}`);
    });
  }

  return NextResponse.json({ ok: true, hasLocation });
}
