import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

// PATCH /api/aip/dossier/request/[id] - Approve or Reject request
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  if (!isAdmin) {
    return NextResponse.json({ error: 'Acesso negado. Apenas administradores podem aprovar solicitações.' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body; // APPROVED ou REJECTED

    if (status !== 'APPROVED' && status !== 'REJECTED') {
      return NextResponse.json({ error: 'Status inválido. Deve ser APPROVED ou REJECTED' }, { status: 400 });
    }

    const dossierRequest = await prisma.dossierRequest.findUnique({
      where: { id },
      include: {
        apenado: { select: { nome: true } },
        user: { select: { name: true } },
      },
    });

    if (!dossierRequest) {
      return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    }

    const updated = await prisma.dossierRequest.update({
      where: { id },
      data: {
        status,
        approvedById: user.id,
      },
    });

    // Auditoria
    await createAuditLog({
      userId: user.id,
      action: status === 'APPROVED' ? AUDIT_ACTIONS.APPROVE_DOSSIER_REQUEST : AUDIT_ACTIONS.REJECT_DOSSIER_REQUEST,
      entity: 'DossierRequest',
      entityId: id,
      details: {
        solicitanteId: dossierRequest.userId,
        solicitanteNome: dossierRequest.user.name,
        apenadoId: dossierRequest.apenadoId,
        apenadoNome: dossierRequest.apenado.nome,
        status,
      },
      request,
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('Error updating dossier request status:', err);
    return NextResponse.json({ error: 'Erro ao processar solicitação' }, { status: 500 });
  }
}
