import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

function parseDateOnly(str: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  return new Date(str);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const { id } = await params;

  try {
    const body = await req.json();
    const mission = await prisma.mission.findUnique({ where: { id } });

    if (!mission) {
      return NextResponse.json({ error: 'Missão não encontrada' }, { status: 404 });
    }

    const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
    if (!isAdmin && mission.userId !== user.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // ===== Regras de transição de status =====
    const newStatus = body.status as 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | undefined;
    const now = new Date();
    const data: any = {};

    if (newStatus && newStatus !== mission.status) {
      // ---- INICIAR (PLANNED -> IN_PROGRESS) ----
      if (newStatus === 'IN_PROGRESS') {
        if (mission.status !== 'PLANNED') {
          return NextResponse.json({ error: 'Só é possível iniciar uma missão planejada' }, { status: 400 });
        }
        // KM inicial obrigatório ao iniciar
        if (body.startKm === undefined || body.startKm === null || body.startKm === '') {
          return NextResponse.json({ error: 'KM inicial é obrigatório para iniciar a missão' }, { status: 400 });
        }
        // Hoje deve ser >= dia agendado (não é possível iniciar antes da data prevista)
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const scheduled = new Date(mission.startDate);
        const scheduledDay = new Date(scheduled.getFullYear(), scheduled.getMonth(), scheduled.getDate());
        if (today < scheduledDay) {
          return NextResponse.json({
            error: 'Esta missão está agendada para uma data futura. Não é possível iniciar antes do dia previsto.'
          }, { status: 400 });
        }
        data.status = 'IN_PROGRESS';
        data.startedAt = now;
        data.startKm = parseInt(body.startKm);
      }

      // ---- FINALIZAR (IN_PROGRESS -> COMPLETED) ----
      else if (newStatus === 'COMPLETED') {
        if (mission.status !== 'IN_PROGRESS') {
          return NextResponse.json({ error: 'Só é possível finalizar uma missão em curso' }, { status: 400 });
        }
        if (body.endKm === undefined || body.endKm === null || body.endKm === '') {
          return NextResponse.json({ error: 'KM final é obrigatório para finalizar' }, { status: 400 });
        }
        const endKmInt = parseInt(body.endKm);
        if (mission.startKm != null && endKmInt < mission.startKm) {
          return NextResponse.json({ error: 'KM final não pode ser menor que o inicial' }, { status: 400 });
        }
        data.status = 'COMPLETED';
        data.endedAt = now;
        data.endKm = endKmInt;
        if (body.endNote !== undefined) data.endNote = body.endNote || null;
      }

      // ---- CANCELAR (somente PLANNED -> CANCELLED) ----
      else if (newStatus === 'CANCELLED') {
        if (mission.status !== 'PLANNED') {
          return NextResponse.json({
            error: 'Não é possível cancelar uma missão em curso ou já finalizada'
          }, { status: 400 });
        }
        data.status = 'CANCELLED';
      }

      // ---- VOLTAR PARA PLANNED não é permitido ----
      else if (newStatus === 'PLANNED') {
        return NextResponse.json({ error: 'Não é possível reverter o status' }, { status: 400 });
      }
    } else {
      // ===== Edição de campos do agendamento (sem mudar status) =====
      // Só permite editar campos do agendamento se ainda está PLANNED
      if (mission.status !== 'PLANNED') {
        const allowedAfterStart = ['endNote']; // outros campos pós-início são bloqueados
        const attempted = Object.keys(body).filter(k => !allowedAfterStart.includes(k));
        if (attempted.length > 0) {
          return NextResponse.json({
            error: 'Missões já iniciadas só podem ser editadas via finalização'
          }, { status: 400 });
        }
      }
      if (body.title !== undefined) data.title = body.title;
      if (body.description !== undefined) data.description = body.description;
      if (body.destination !== undefined) data.destination = body.destination;
      if (body.startDate !== undefined) data.startDate = parseDateOnly(body.startDate);
      if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
      if (body.participants !== undefined) data.participants = body.participants;
      if (body.groupId !== undefined) data.groupId = body.groupId || null;
    }

    const updated = await prisma.mission.update({
      where: { id },
      data,
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
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const { id } = await params;

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
