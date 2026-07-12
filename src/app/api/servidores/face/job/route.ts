import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getServidorJobState, startServidorJob, stopServidorJob } from '@/lib/servidores-indexing-job';

function isAdmin(role: string) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  return NextResponse.json(getServidorJobState());
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

  startServidorJob(model);
  return NextResponse.json(getServidorJobState());
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  stopServidorJob();
  return NextResponse.json({ stopped: true });
}
