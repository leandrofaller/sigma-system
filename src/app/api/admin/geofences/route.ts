import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

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
    const fences = await prisma.geofence.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, fences });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Admin/Geofences] GET error: ${errorMsg}`);
    return NextResponse.json(
      { error: `Erro ao buscar cercas geográficas: ${errorMsg}`, success: false },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, type, action, coordinates, isActive } = body;

    if (!name || !type || !action || !coordinates) {
      return NextResponse.json(
        { error: 'Parâmetros name, type, action e coordinates são obrigatórios', success: false },
        { status: 400 }
      );
    }

    if (type !== 'circle' && type !== 'polygon') {
      return NextResponse.json(
        { error: 'Tipo inválido. Deve ser "circle" ou "polygon"', success: false },
        { status: 400 }
      );
    }

    if (action !== 'allow' && action !== 'deny') {
      return NextResponse.json(
        { error: 'Ação inválida. Deve ser "allow" ou "deny"', success: false },
        { status: 400 }
      );
    }

    const fence = await prisma.geofence.create({
      data: {
        name,
        type,
        action,
        coordinates,
        isActive: isActive !== false,
      },
    });

    console.log(`[Admin/Geofences] ${user.email} criou a cerca "${name}" (${type}/${action})`);

    return NextResponse.json({
      success: true,
      fence,
      message: `Cerca geográfica "${name}" criada com sucesso.`,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Admin/Geofences] POST error: ${errorMsg}`);
    return NextResponse.json(
      { error: `Erro ao criar cerca geográfica: ${errorMsg}`, success: false },
      { status: 500 }
    );
  }
}
