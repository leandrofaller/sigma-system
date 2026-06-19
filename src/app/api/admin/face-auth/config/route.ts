import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

const DEFAULT_THRESHOLD = 0.40;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const currentUser = session.user as any;
  if (currentUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Super Administrador.' }, { status: 403 });
  }

  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'FACE_THRESHOLD' },
    });
    const threshold = config && typeof config.value === 'number' ? config.value : DEFAULT_THRESHOLD;
    return NextResponse.json({ threshold });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao obter configuração: ' + err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const currentUser = session.user as any;
  if (currentUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Super Administrador.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { threshold } = body;

    if (typeof threshold !== 'number' || threshold < 0.10 || threshold > 0.90) {
      return NextResponse.json({ error: 'Threshold inválido. Deve ser um número entre 0.10 e 0.90.' }, { status: 400 });
    }

    const config = await prisma.systemConfig.upsert({
      where: { key: 'FACE_THRESHOLD' },
      update: {
        value: threshold,
        updatedBy: currentUser.id,
      },
      create: {
        key: 'FACE_THRESHOLD',
        value: threshold,
        description: 'Threshold global de distância euclidiana para o login por reconhecimento facial',
        updatedBy: currentUser.id,
      },
    });

    // Registra log de auditoria
    await createAuditLog({
      userId: currentUser.id,
      action: AUDIT_ACTIONS.CHANGE_CONFIG,
      entity: 'SystemConfig',
      entityId: config.id,
      details: { key: 'FACE_THRESHOLD', value: threshold },
      request: req,
    });

    return NextResponse.json({ success: true, threshold: config.value });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao salvar configuração: ' + err.message }, { status: 500 });
  }
}
