import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getVisitanteJobState, startVisitanteJob, stopVisitanteJob } from '@/lib/visitantes-indexing-job';

function isAdmin(role: string) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  return NextResponse.json(getVisitanteJobState());
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  let model: 'buffalo' | 'antelope' = 'buffalo';
  try {
    const body = await req.json();
    if (body.model === 'antelope') model = 'antelope';
  } catch {}

  startVisitanteJob(model);
  return NextResponse.json(getVisitanteJobState());
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  stopVisitanteJob();
  return NextResponse.json({ stopped: true });
}
