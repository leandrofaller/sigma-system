import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getApenadosDiskUsage } from '@/lib/storage';
import { ApenadosClient } from '@/components/apenados/ApenadosClient';

export const metadata = { title: 'Identificação de Apenados' };

export default async function ApenadosPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const [total, comFoto, letterRows, diskUsage] = await Promise.all([
    prisma.apenado.count(),
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    prisma.$queryRaw<{ letter: string; count: number }[]>`
      SELECT UPPER(LEFT(name, 1)) AS letter, COUNT(*)::int AS count
      FROM apenados
      WHERE LENGTH(TRIM(name)) > 0
      GROUP BY UPPER(LEFT(name, 1))
      ORDER BY letter
    `,
    getApenadosDiskUsage(),
  ]);

  const letterCounts: Record<string, number> = {};
  for (const row of letterRows) {
    letterCounts[row.letter] = Number(row.count);
  }

  const user = session.user as any;

  return (
    <ApenadosClient
      stats={{ total, comFoto, semFoto: total - comFoto, diskUsage }}
      letterCounts={letterCounts}
      userRole={user.role}
    />
  );
}
