import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkLocationAgainstGeofences } from '@/lib/geofencing';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;

  try {
    const body = await req.json();
    const { lat, lng, accuracy, address } = body;

    // Validação de coordenadas
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: 'Coordenadas inválidas', success: false },
        { status: 400 }
      );
    }

    // Validação de range
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: 'Coordenadas fora do range válido', success: false },
        { status: 400 }
      );
    }

    // Sanitizar accuracy e address
    const cleanAccuracy = Math.max(0, accuracy || 0);
    const cleanAddress = address ? String(address).substring(0, 255) : null;

    // Verificar cercas geográficas (isenta apenas SUPER_ADMIN)
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    let isAllowed = true;
    let blockedByFenceName: string | undefined = undefined;

    if (!isSuperAdmin) {
      const fenceCheck = await checkLocationAgainstGeofences(lat, lng);
      isAllowed = fenceCheck.isAllowed;
      blockedByFenceName = fenceCheck.blockedByFenceName;
    }

    const geoStatus = isAllowed ? 'authorized' : 'blocked_area';

    // Atualizar user.geoLocationData e geoStatus
    const geoData = {
      lat: parseFloat(lat.toFixed(6)),
      lng: parseFloat(lng.toFixed(6)),
      accuracy: cleanAccuracy > 0 ? Math.round(cleanAccuracy) : null,
      address: cleanAddress,
      timestamp: new Date().toISOString(),
      blockedByFence: blockedByFenceName || null,
    };

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        geoStatus,
        geoLocationData: geoData,
        lastLocation: geoData, // Mantém compatibilidade com campo antigo
      },
    });

    // Também registrar no histórico de localizações
    await prisma.userLocation.create({
      data: {
        userId: user.id,
        lat: geoData.lat,
        lng: geoData.lng,
        accuracy: geoData.accuracy,
        address: cleanAddress,
      },
    }).catch(err => {
      console.warn(`[Geo/Capture] Erro ao criar histórico: ${err.message}`);
    });

    if (!isAllowed) {
      console.warn(`[Geo/Capture] ❌ ${user.email} bloqueado por cerca geográfica: ${blockedByFenceName}`);
      return NextResponse.json({
        success: false,
        error: `Acesso restrito nesta localização. Uso proibido na área: ${blockedByFenceName}.`,
        geoStatus: 'blocked_area',
      }, { status: 403 });
    }

    console.log(`[Geo/Capture] ✓ ${user.email}: ${cleanAddress || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}`);

    return NextResponse.json({
      success: true,
      geoStatus: updatedUser.geoStatus,
      address: cleanAddress,
      accuracy: cleanAccuracy,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Geo/Capture] POST error: ${errorMsg}`);
    return NextResponse.json(
      { error: 'Erro ao processar geolocalização', success: false },
      { status: 500 }
    );
  }
}
