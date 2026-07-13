import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const counterCfg = await prisma.systemConfig.findUnique({
    where: { key: 'debriefing_counter' }
  });
  const current = (counterCfg?.value as any) || { next: 1 };
  const next = current.next || 1;
  const formatted = String(next).padStart(5, '0');

  return NextResponse.json({ number: formatted });
}
