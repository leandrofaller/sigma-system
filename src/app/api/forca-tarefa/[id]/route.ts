import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { calcularIIP } from '@/lib/iip';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const id = (await params).id;
  const relatorio = await prisma.relatorioForcaTarefa.findUnique({
    where: { id },
    include: { author: true, group: true },
  });

  if (!relatorio) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && relatorio.groupId !== user.groupId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  return NextResponse.json(relatorio);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();
  const user = session.user as any;
  const id = (await params).id;

  const existing = await prisma.relatorioForcaTarefa.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin) {
    if (existing.groupId !== user.groupId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    if (user.groupName === 'NI/AIP/JI-PARANÁ' && existing.authorId !== user.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  }

  // Lógica do motor de cálculo do IIP
  let iipData = {};
  if (body.iipFactors !== undefined) {
    const iipCalculado = calcularIIP(body.iipFactors || []);
    iipData = {
      iipScore: iipCalculado.score,
      iipLevel: iipCalculado.level,
      iipFactors: body.iipFactors,
      alertaAtivo: iipCalculado.alertaAtivo,
      alertaResolvido: iipCalculado.alertaAtivo && !existing.alertaAtivo ? false : existing.alertaResolvido,
    };
  }

  // Dados exclusivos de administrador (Direção AIP)
  const adminData = isAdmin ? {
    ripStatus: body.ripStatus !== undefined ? body.ripStatus : undefined,
    providencias: body.providencias !== undefined ? body.providencias : undefined,
    observacoesAip: body.observacoesAip !== undefined ? body.observacoesAip : undefined,
    alertaResolvido: body.alertaResolvido !== undefined ? body.alertaResolvido : undefined,
  } : {};

  const relatorio = await prisma.relatorioForcaTarefa.update({
    where: { id },
    data: {
      date: body.date ? new Date(body.date) : undefined,
      periodoInicio: body.periodoInicio ? new Date(body.periodoInicio) : undefined,
      periodoFim: body.periodoFim ? new Date(body.periodoFim) : undefined,
      forcaTarefa: body.forcaTarefa,
      content: body.content,
      status: body.status,
      groupId: body.groupId,

      // Novos campos
      municipio: body.municipio !== undefined ? body.municipio : undefined,
      faccoes: body.faccoes !== undefined ? body.faccoes : undefined,
      ...iipData,
      ...adminData,
    },
    include: { author: true, group: true },
  });

  await createAuditLog({
    userId: user.id,
    action: relatorio.status === 'PUBLISHED' && existing.status !== 'PUBLISHED' 
      ? AUDIT_ACTIONS.PUBLISH_RFT 
      : AUDIT_ACTIONS.EDIT_RFT,
    entity: 'RelatorioForcaTarefa',
    entityId: relatorio.id,
    details: { number: relatorio.number, status: relatorio.status, iipScore: relatorio.iipScore, ripStatus: relatorio.ripStatus },
    request: req,
  });

  return NextResponse.json(relatorio);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const id = (await params).id;

  const relatorio = await prisma.relatorioForcaTarefa.findUnique({
    where: { id },
    select: { authorId: true, status: true, number: true },
  });

  if (!relatorio) {
    return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 });
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isAdmin = user.role === 'ADMIN';
  const isAuthor = relatorio.authorId === user.id;

  if (isSuperAdmin) {
    await prisma.relatorioForcaTarefa.delete({ where: { id } });
  } else if (isAuthor) {
    await prisma.relatorioForcaTarefa.update({
      where: { id },
      data: { status: 'DELETION_REQUESTED' as any },
    });

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE_RFT,
      entity: 'RelatorioForcaTarefa',
      entityId: id,
      details: { number: relatorio.number, info: 'Solicitação de exclusão enviada para revisão' },
      request: req,
    });

    return NextResponse.json({ success: true, message: 'Exclusão solicitada para revisão do administrador' });
  } else if (isAdmin && relatorio.status === 'DELETION_REQUESTED') {
    await prisma.relatorioForcaTarefa.delete({ where: { id } });
  } else {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.DELETE_RFT,
    entity: 'RelatorioForcaTarefa',
    entityId: id,
    details: { number: relatorio.number, status: 'DELETED' },
    request: req,
  });

  return NextResponse.json({ success: true });
}
