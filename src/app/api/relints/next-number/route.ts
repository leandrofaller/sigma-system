import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const formatted = await prisma.$transaction(async (tx) => {
    const year = new Date().getFullYear();

    const counterCfg = await tx.systemConfig.findUnique({ where: { key: 'relint_counter' } });
    const current = (counterCfg?.value as any) || { next: 1, year };
    const next = current.year === year ? (current.next || 1) : 1;

    await tx.systemConfig.upsert({
      where: { key: 'relint_counter' },
      update: { value: { next: next + 1, year } },
      create: { key: 'relint_counter', value: { next: next + 1, year } },
    });

    const prefixCfg = await tx.systemConfig.findUnique({ where: { key: 'relint_prefix' } });
    const prefix = (prefixCfg?.value as any)?.prefix || 'RELINT';

    const suffixCfg = await tx.systemConfig.findUnique({ where: { key: 'relint_suffix' } });
    const suffix = (suffixCfg?.value as any)?.suffix || 'AIP/SEJUS/RO';

    return `${prefix} Nº ${String(next).padStart(3, '0')}/${year}/${suffix}`;
  });

  return NextResponse.json({ number: formatted });
}
