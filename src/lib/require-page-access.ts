import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function requirePageAccess(key: string) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const user = session.user as any;

  if (user.role === 'SUPER_ADMIN') return user;

  const config = await prisma.sidebarConfig.findUnique({ where: { key } });

  if (!config || !config.enabled || !config.roles.includes(user.role)) {
    redirect('/dashboard');
  }

  return user;
}
