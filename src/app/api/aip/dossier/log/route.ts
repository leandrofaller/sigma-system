import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

// POST /api/aip/dossier/log - Log the dossier download/generation event
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;

  try {
    const body = await request.json();
    const { apenadoId } = body;

    if (!apenadoId) {
      return NextResponse.json({ error: 'apenadoId é obrigatório' }, { status: 400 });
    }

    const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

    // Se não for admin, verificar se realmente possui uma solicitação aprovada nas últimas 24 horas
    if (!isAdmin) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const activeApproval = await prisma.dossierRequest.findFirst({
        where: {
          apenadoId,
          userId: user.id,
          status: 'APPROVED',
          updatedAt: { gte: oneDayAgo },
        },
      });

      if (!activeApproval) {
        return NextResponse.json({ error: 'Acesso negado. Ação não autorizada pelos administradores.' }, { status: 403 });
      }
    }

    const apenado = await prisma.aIPApenado.findUnique({
      where: { id: apenadoId },
      select: { nome: true },
    });

    if (!apenado) {
      return NextResponse.json({ error: 'Apenado não encontrado' }, { status: 404 });
    }

    // Gravar log de auditoria
    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.GENERATE_DOSSIER,
      entity: 'AIPApenado',
      entityId: apenadoId,
      details: {
        apenadoNome: apenado.nome,
        role: user.role,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error logging dossier generation:', err);
    return NextResponse.json({ error: 'Erro ao gravar log de auditoria' }, { status: 500 });
  }
}
