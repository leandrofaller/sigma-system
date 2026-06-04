import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId é obrigatório', success: false },
        { status: 400 }
      );
    }

    // Atualizar user com aprovação do admin
    const approvedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        geoStatus: 'admin-approved',
        geoApprovedBy: user.id,
        geoApprovedAt: new Date(),
      },
      select: { id: true, name: true, email: true, geoStatus: true },
    });

    console.log(`[Geo/Admin/Approve] ${user.email} aprovou geo para ${approvedUser.email}`);

    return NextResponse.json({
      success: true,
      user: approvedUser,
      message: `Acesso aprovado para ${approvedUser.name}`,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Geo/Admin/Approve] POST error: ${errorMsg}`);
    return NextResponse.json(
      { error: 'Erro ao aprovar geolocalização', success: false },
      { status: 500 }
    );
  }
}
