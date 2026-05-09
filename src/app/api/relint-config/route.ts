import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Public (authenticated) read for non-sensitive display configs like badge sizes
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const config = await prisma.systemConfig.findUnique({ where: { key: 'badge_sizes' } });
  return NextResponse.json((config?.value as any) ?? { sejus: 72, aip: 80, policiaPenal: 72 });
}
