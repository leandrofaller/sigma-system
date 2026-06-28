import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getClassificationState,
  startClassificationJob,
  stopClassificationJob,
} from '@/lib/photo-classification-job';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as { role?: string };
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  return NextResponse.json(getClassificationState());
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as { role?: string };
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === 'stop') {
    stopClassificationJob();
    return NextResponse.json({ ok: true, message: 'Parando classificação...' });
  }

  const mode = body.mode as 'none_only' | 'all' | 'stale' | undefined;
  if (mode && !['none_only', 'all', 'stale'].includes(mode)) {
    return NextResponse.json({ error: 'mode inválido' }, { status: 400 });
  }

  const state = getClassificationState();
  if (state.isRunning) {
    return NextResponse.json({ error: 'Classificação já em execução' }, { status: 409 });
  }

  startClassificationJob(mode ?? 'none_only');
  return NextResponse.json({
    ok: true,
    message: 'Classificação iniciada em background',
    mode: mode ?? 'none_only',
  });
}