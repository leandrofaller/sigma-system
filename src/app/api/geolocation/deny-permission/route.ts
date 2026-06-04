import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;

  try {
    // Atualizar geoStatus para denied
    await prisma.user.update({
      where: { id: user.id },
      data: {
        geoStatus: 'denied',
        geoDeniedAt: new Date(),
      },
    });

    console.log(`[Geo/Deny] ${user.email} negou permissão de geolocalização`);

    return NextResponse.json({
      success: true,
      message: 'Permissão negada. Um administrador precisará autorizar seu acesso.',
      requiresAdminApproval: true,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Geo/Deny] POST error: ${errorMsg}`);
    return NextResponse.json(
      { error: 'Erro ao processar negação', success: false },
      { status: 500 }
    );
  }
}
