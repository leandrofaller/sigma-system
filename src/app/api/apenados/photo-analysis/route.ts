import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getPhotoAnalysisState, startPhotoAnalysisJob } from '@/lib/photo-analysis-job';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const jobState = getPhotoAnalysisState();

  const unindexed = await prisma.apenado.count({
    where: {
      photoPath: { not: null },
      OR: [{ photoHash: null }, { photoQuality: null }],
    },
  });

  return NextResponse.json({ ...jobState, unindexed });
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const jobState = getPhotoAnalysisState();
  if (jobState.isRunning) {
    return NextResponse.json({ error: 'Job já em andamento.' }, { status: 409 });
  }

  startPhotoAnalysisJob();
  return NextResponse.json({ started: true });
}
