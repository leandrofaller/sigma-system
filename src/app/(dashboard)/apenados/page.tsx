import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getApenadosDiskUsage } from '@/lib/storage';
import { ApenadosClient } from '@/components/apenados/ApenadosClient';
import { MobileApenadosView } from '@/components/apenados/MobileApenadosView';
import { headers } from 'next/headers';

export const metadata = { title: 'Identificação de Apenados' };

export default async function ApenadosPage() {
  const session = await auth();
  if (!session) redirect('/login');

  // Detectar dispositivo móvel a partir do User-Agent
  const headersList = await headers();
  const ua = headersList.get('user-agent') || '';
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);

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

  if (isMobile) {
    return (
      <MobileApenadosView
        stats={{ total, comFoto, semFoto: total - comFoto }}
        letterCounts={letterCounts}
        userRole={user.role}
      />
    );
  }

  return (
    <ApenadosClient
      stats={{ total, comFoto, semFoto: total - comFoto, diskUsage }}
      letterCounts={letterCounts}
      userRole={user.role}
    />
  );
}
