import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { MobileApenadosView } from '@/components/apenados/MobileApenadosView';

export const metadata = { title: 'Identificação de Apenados' };

export default async function MobileApenadosPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const user = session.user as any;

  const userDb = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, canEditApenados: true, canDeletePhotos: true }
  });

  const canEditApenados = userDb?.role === 'SUPER_ADMIN' || userDb?.role === 'ADMIN' || !!userDb?.canEditApenados;
  const canDeletePhotos = userDb?.role === 'SUPER_ADMIN' || userDb?.role === 'ADMIN' || !!userDb?.canDeletePhotos;

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

  return (
    <MobileApenadosView
      stats={{ total, comFoto, semFoto: total - comFoto }}
      letterCounts={letterCounts}
      userRole={user.role}
      canEditApenados={canEditApenados}
      canDeletePhotos={canDeletePhotos}
    />
  );
}
