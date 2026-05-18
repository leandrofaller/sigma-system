import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const [total, comFoto, letterRows] = await Promise.all([
    prisma.apenado.count(),
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    prisma.$queryRaw<{ letter: string; count: number }[]>`
      SELECT UPPER(LEFT(name, 1)) AS letter, COUNT(*)::int AS count
      FROM apenados
      WHERE LENGTH(TRIM(name)) > 0
      GROUP BY UPPER(LEFT(name, 1))
      ORDER BY letter
    `,
  ]);

  const letterCounts: Record<string, number> = {};
  for (const row of letterRows) {
    letterCounts[row.letter] = Number(row.count);
  }

  return NextResponse.json({ total, comFoto, semFoto: total - comFoto, letterCounts });
}
