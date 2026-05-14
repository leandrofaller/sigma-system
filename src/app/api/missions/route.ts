import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const includeCancelled = req.nextUrl.searchParams.get('includeCancelled') === '1';

  try {
    const missions = await prisma.mission.findMany({
      where: includeCancelled ? {} : { status: { not: 'CANCELLED' } },
      include: {
        user: { select: { name: true, avatar: true } },
        group: { select: { name: true, color: true } },
      },
      orderBy: { startDate: 'asc' },
    });
    return NextResponse.json(missions);
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao buscar missões' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const { count } = await prisma.mission.deleteMany({});

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE_ALL_MISSIONS,
      entity: 'Mission',
      details: { deletedCount: count },
      request: req,
    });

    return NextResponse.json({ deleted: count });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao apagar missões' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;

  try {
    const body = await req.json();
    const {
      title, description, destination, startDate, endDate, groupId, participants,
      // Caso "iniciar agora" — cria já em IN_PROGRESS com KM e hora real
      startKm, startNow,
    } = body;

    if (!title || !destination || !startDate) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    // Quando "iniciar agora", startKm é obrigatório
    if (startNow && (startKm === undefined || startKm === null || startKm === '')) {
      return NextResponse.json({ error: 'KM inicial é obrigatório para iniciar agora' }, { status: 400 });
    }

    const now = new Date();
    const mission = await prisma.mission.create({
      data: {
        title,
        description,
        destination,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        status: startNow ? 'IN_PROGRESS' : 'PLANNED',
        startedAt: startNow ? now : null,
        startKm: startNow && startKm ? parseInt(startKm) : null,
        participants: participants || [],
        userId: user.id,
        groupId: groupId || user.groupId,
      },
      include: {
        user: { select: { name: true } },
        group: { select: { name: true } },
      },
    });

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.CREATE_RELINT, // Usando uma ação existente ou definindo nova se necessário
      entity: 'Mission',
      entityId: mission.id,
      details: { title, destination },
      request: req,
    });

    return NextResponse.json(mission, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao criar missão' }, { status: 500 });
  }
}
