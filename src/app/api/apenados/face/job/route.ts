import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getJobState, startJob, stopJob } from '@/lib/indexing-job';

function isAdmin(role: string) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  return NextResponse.json(getJobState());
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  startJob();
  return NextResponse.json(getJobState());
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  stopJob();
  return NextResponse.json({ stopped: true });
}
