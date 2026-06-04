import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending'; // pending | denied | authorized | admin-approved

    // Buscar usuários com status de geo específico
    const users = await prisma.user.findMany({
      where: { geoStatus: status },
      select: {
        id: true,
        name: true,
        email: true,
        geoStatus: true,
        geoLocationData: true,
        geoDeniedAt: true,
        geoApprovedBy: true,
        geoApprovedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enriquecer com info do admin que aprovou
    const enriched = await Promise.all(
      users.map(async (u: any) => {
        let approverName = null;
        if (u.geoApprovedBy) {
          const approver = await prisma.user.findUnique({
            where: { id: u.geoApprovedBy },
            select: { name: true },
          });
          approverName = approver?.name;
        }
        return { ...u, approverName };
      })
    );

    console.log(`[Geo/Admin/Pending] ${user.email} listou ${status}: ${enriched.length} usuários`);

    return NextResponse.json({
      status,
      count: enriched.length,
      users: enriched,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Geo/Admin/Pending] GET error: ${errorMsg}`);
    return NextResponse.json(
      { error: 'Erro ao buscar pendentes', success: false },
      { status: 500 }
    );
  }
}
