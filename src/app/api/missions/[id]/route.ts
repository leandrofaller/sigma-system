import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const { id } = params;

  try {
    const body = await req.json();
    const mission = await prisma.mission.findUnique({ where: { id } });

    if (!mission) {
      return NextResponse.json({ error: 'Missão não encontrada' }, { status: 404 });
    }

    // Apenas o autor ou admin pode editar
    const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
    if (!isAdmin && mission.userId !== user.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const updated = await prisma.mission.update({
      where: { id },
      data: {
        ...body,
        // Garantir que datas sejam objetos Date se fornecidas
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        participants: body.participants !== undefined ? body.participants : undefined,
        startKm: body.startKm !== undefined ? (body.startKm ? parseInt(body.startKm) : null) : undefined,
        endKm: body.endKm !== undefined ? (body.endKm ? parseInt(body.endKm) : null) : undefined,
      },
      include: {
        user: { select: { name: true } },
        group: { select: { name: true } },
      },
    });

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.EDIT_RELINT,
      entity: 'Mission',
      entityId: id,
      details: { status: updated.status },
      request: req,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao atualizar missão' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const { id } = params;

  try {
    const mission = await prisma.mission.findUnique({ where: { id } });

    if (!mission) {
      return NextResponse.json({ error: 'Missão não encontrada' }, { status: 404 });
    }

    const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
    if (!isAdmin && mission.userId !== user.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    await prisma.mission.delete({ where: { id } });

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE_RELINT,
      entity: 'Mission',
      entityId: id,
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao excluir missão' }, { status: 500 });
  }
}
