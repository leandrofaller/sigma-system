import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAdvancedJobState, startAdvancedJob, stopAdvancedJob } from '@/lib/advanced-indexing-job';
import { pgvectorAdvancedAvailable } from '@/lib/pgvector';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const [total, indexed, withPhoto, remaining] = await Promise.all([
      prisma.apenado.count(),
      prisma.apenado.count({ where: { faceDescriptorAdvanced: { not: null, notIn: ['NONE'] } } }),
      prisma.apenado.count({ where: { photoPath: { not: null } } }),
      prisma.apenado.count({ where: { photoPath: { not: null }, faceDescriptorAdvanced: null } })
    ]);

    const noFace = await prisma.apenado.count({ where: { faceDescriptorAdvanced: 'NONE' } });
    const jobState = getAdvancedJobState();
    
    // Dispara a migração/indexação automática se houver pendentes e o job não estiver rodando
    if (remaining > 0 && !jobState.isRunning && !jobState.timedOut) {
      startAdvancedJob();
      jobState.isRunning = true;
    }

    const pvecAvail = await pgvectorAdvancedAvailable();

    return NextResponse.json({
      total,
      indexed,
      withPhoto,
      noFace,
      remaining,
      pgvectorAvailable: pvecAvail,
      job: {
        isRunning: jobState.isRunning,
        timedOut: jobState.timedOut,
        progress: jobState.progress,
        error: jobState.error
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === 'start') {
    startAdvancedJob();
    return NextResponse.json({ ok: true, message: 'Job avançado iniciado' });
  } else if (action === 'stop') {
    stopAdvancedJob();
    return NextResponse.json({ ok: true, message: 'Job avançado interrompido' });
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
