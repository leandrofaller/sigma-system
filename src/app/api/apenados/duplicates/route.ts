import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSimilarDupState, startSimilarDupJob } from '@/lib/similar-duplicates-job';

export async function GET() {
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
}

export async function POST(_req: NextRequest) {
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
}
