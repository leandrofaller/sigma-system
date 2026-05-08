import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { UsersTable } from '@/components/admin/UsersTable';

async function getData() {
  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { group: true },
    }),
    prisma.group.findMany({ where: { isActive: true } }),
  ]);
  return { users, groups };
}

export default async function UsuariosPage() {
  const session = await auth();
  const user = session!.user as any;

  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { users, groups } = await getData();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gerenciar Usuários</h1>
        <p className="text-gray-500 text-sm mt-1">
          {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
        </p>
      </div>
      <UsersTable users={users as any} groups={groups} currentUserRole={user.role} />
    </div>
  );
}
