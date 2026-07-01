import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, type, action, coordinates, isActive } = body;

    // Verificar se existe a cerca
    const existing = await prisma.geofence.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Cerca geográfica não encontrada', success: false },
        { status: 404 }
      );
    }

    const updated = await prisma.geofence.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(action && { action }),
        ...(coordinates && { coordinates }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    console.log(`[Admin/Geofences] ${user.email} atualizou a cerca "${updated.name}"`);

    return NextResponse.json({
      success: true,
      fence: updated,
      message: `Cerca geográfica "${updated.name}" atualizada com sucesso.`,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Admin/Geofences] PUT error: ${errorMsg}`);
    return NextResponse.json(
      { error: `Erro ao atualizar cerca geográfica: ${errorMsg}`, success: false },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const { id } = await params;

    const existing = await prisma.geofence.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Cerca geográfica não encontrada', success: false },
        { status: 404 }
      );
    }

    await prisma.geofence.delete({
      where: { id },
    });

    console.log(`[Admin/Geofences] ${user.email} deletou a cerca "${existing.name}"`);

    return NextResponse.json({
      success: true,
      message: `Cerca geográfica "${existing.name}" excluída com sucesso.`,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Admin/Geofences] DELETE error: ${errorMsg}`);
    return NextResponse.json(
      { error: `Erro ao excluir cerca geográfica: ${errorMsg}`, success: false },
      { status: 500 }
    );
  }
}
