import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const relint = await prisma.relint.findUnique({
    where: { id: params.id },
    include: { author: true, group: true, template: true, attachments: true },
  });

  if (!relint) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && relint.groupId !== user.groupId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  return NextResponse.json(relint);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();
  const user = session.user as any;

  const existing = await prisma.relint.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && existing.authorId !== user.id) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const relint = await prisma.relint.update({
    where: { id: params.id },
    data: {
      date: body.date ? new Date(body.date) : undefined,
      subject: body.subject,
      diffusion: body.diffusion,
      content: body.content,
      classification: body.classification,
      status: body.status,
      groupId: body.groupId,
    },
    include: { author: true, group: true },
  });

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.EDIT_RELINT,
    entity: 'Relint',
    entityId: relint.id,
    details: { changes: body },
    request: req,
  });

  return NextResponse.json(relint);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  
  const relint = await prisma.relint.findUnique({
    where: { id: params.id },
    select: { authorId: true }
  });

  if (!relint) {
    return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 });
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isAdmin = user.role === 'ADMIN';
  const isAuthor = relint.authorId === user.id;

  if (isSuperAdmin) {
    // Super Admin deleta imediatamente
    await prisma.relint.delete({ where: { id: params.id } });
  } else if (isAuthor) {
    // Autor solicita a exclusão (revisão)
    await prisma.relint.update({
      where: { id: params.id },
      data: { status: 'DELETION_REQUESTED' as any }
    });

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE_RELINT, // Podemos considerar como solicitação no log
      entity: 'Relint',
      entityId: params.id,
      details: { info: 'Solicitação de exclusão enviada para revisão' },
      request: req,
    });

    return NextResponse.json({ success: true, message: 'Exclusão solicitada para revisão do administrador' });
  } else if (isAdmin && relint.status === 'DELETION_REQUESTED') {
    // Admin aprova a exclusão solicitada
    await prisma.relint.delete({ where: { id: params.id } });
  } else {
    return NextResponse.json({ error: 'Acesso negado. Apenas o autor pode solicitar a exclusão, e apenas o Super Administrador pode excluir diretamente.' }, { status: 403 });
  }

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.DELETE_RELINT,
    entity: 'Relint',
    entityId: params.id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
