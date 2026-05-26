import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSimilarDupState, startSimilarDupJob } from '@/lib/similar-duplicates-job';

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const jobState = getSimilarDupState();
    const unindexed = await prisma.apenado.count({
      where: { photoPath: { not: null }, photoHash: null },
    });

    return NextResponse.json({ ...jobState, unindexed });
  } catch (err: any) {
    return NextResponse.json(
      { isRunning: false, totalAnalyzed: 0, totalGroups: 0, groups: [], error: err?.message ?? 'Erro interno', unindexed: 0 },
      { status: 500 },
    );
  }
}

export async function POST(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const jobState = getSimilarDupState();
    if (jobState.isRunning) {
      return NextResponse.json({ error: 'Verificação já em andamento.' }, { status: 409 });
    }

    startSimilarDupJob();
    return NextResponse.json({ started: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
