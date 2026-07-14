import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const counterCfg = await prisma.systemConfig.findUnique({
    where: { key: 'relint_counter' }
  });
  const body = await req.json().catch(() => ({}));
  const type = body.type || 'RELINT';
  const current = (counterCfg?.value as any) || { next: 1 };
  const next = current.next || 1;
  const year = new Date().getFullYear();
  const formatted = `${type} Nº ${String(next).padStart(5, '0')}/${year}/AIP/SEJUS/RO`;

  return NextResponse.json({ number: formatted });
}
