import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

// GET /api/aip/dossier/request - List requests
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  try {
    const requests = await prisma.dossierRequest.findMany({
      where: isAdmin ? {} : { userId: user.id },
      include: {
        user: { select: { name: true, email: true } },
        apenado: { select: { nome: true, cpf: true } },
        approvedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(requests);
  } catch (err: any) {
    console.error('Error fetching dossier requests:', err);
    return NextResponse.json({ error: 'Erro ao buscar solicitações' }, { status: 500 });
  }
}

// POST /api/aip/dossier/request - Create request
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;

  try {
    const body = await request.json();
    const { apenadoId, reason } = body;

    if (!apenadoId || !reason) {
      return NextResponse.json({ error: 'apenadoId e justificativa são obrigatórios' }, { status: 400 });
    }

    // Verificar se já existe uma solicitação pendente do mesmo usuário para o mesmo apenado
    const existingPending = await prisma.dossierRequest.findFirst({
      where: {
        apenadoId,
        userId: user.id,
        status: 'PENDING',
      },
    });

    if (existingPending) {
      return NextResponse.json({ error: 'Você já possui uma solicitação pendente para este apenado.' }, { status: 400 });
    }

    const dossierRequest = await prisma.dossierRequest.create({
      data: {
        apenadoId,
        userId: user.id,
        reason,
        status: 'PENDING',
      },
      include: {
        apenado: { select: { nome: true } },
      },
    });

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.REQUEST_DOSSIER,
      entity: 'DossierRequest',
      entityId: dossierRequest.id,
      details: {
        apenadoId,
        apenadoNome: dossierRequest.apenado.nome,
        reason,
      },
      request,
    });

    return NextResponse.json(dossierRequest, { status: 201 });
  } catch (err: any) {
    console.error('Error creating dossier request:', err);
    return NextResponse.json({ error: 'Erro ao enviar solicitação' }, { status: 500 });
  }
}
