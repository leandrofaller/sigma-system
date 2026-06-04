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

    // Forçar aprovação mesmo sem geo
    const forceApprovedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        geoStatus: 'admin-approved',
        geoApprovedBy: user.id,
        geoApprovedAt: new Date(),
      },
      select: { id: true, name: true, email: true, geoStatus: true },
    });

    // Também marcar no device como forced
    await prisma.userDevice.updateMany({
      where: { userId },
      data: { geoForcedApproval: true },
    }).catch(err => {
      console.warn(`[Geo/Force] Erro ao marcar device: ${err.message}`);
    });

    console.log(`[Geo/Admin/Force] ${user.email} forçou acesso geo para ${forceApprovedUser.email}`);

    return NextResponse.json({
      success: true,
      user: forceApprovedUser,
      message: `Acesso forcefully aprovado para ${forceApprovedUser.name}`,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Geo/Admin/Force] POST error: ${errorMsg}`);
    return NextResponse.json(
      { error: 'Erro ao forçar acesso', success: false },
      { status: 500 }
    );
  }
}
