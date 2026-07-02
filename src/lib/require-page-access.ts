import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function requirePageAccess(key: string) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const user = session.user as any;

  if (user.role === 'SUPER_ADMIN') return user;

  const config = await prisma.sidebarConfig.findUnique({ where: { key } });

  if (!config || !config.enabled) {
    redirect('/dashboard');
  }

  if (!config.roles.includes(user.role)) {
    // Fallback de código para garantir que operadores e administradores acessem servidores
    // se a aba estiver habilitada no banco, mesmo antes de rodar a migração das roles
    if (key === 'servidores' && (user.role === 'ADMIN' || user.role === 'OPERATOR')) {
      return user;
    }
    redirect('/dashboard');
  }

  return user;
}
