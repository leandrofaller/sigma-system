import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { UsersTable } from '@/components/admin/UsersTable';
import { AccessRequestsPanel } from '@/components/admin/AccessRequestsPanel';
import { AdminUsersTabs } from '@/components/admin/AdminUsersTabs';

async function getData() {
  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { group: true },
    }),
    prisma.group.findMany({ where: { isActive: true } }),
  ]);

  // Table may not exist yet if prisma db push hasn't run on the VPS
  let requests: any[] = [];
  try {
    requests = await prisma.accessRequest.findMany({ orderBy: { createdAt: 'desc' } });
  } catch {
    // access_requests table not yet created — silently skip
  }

  return { users, groups, requests };
}

export default async function UsuariosPage() {
  const session = await auth();
  const user = session!.user as any;

  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { users, groups, requests } = await getData();
  const pendingCount = requests.filter((r: { status: string }) => r.status === 'PENDING').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">Gerenciar Usuários</h1>
        <p className="text-body text-sm mt-1">
          {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
          {pendingCount > 0 && ` · ${pendingCount} solicitação${pendingCount !== 1 ? 'ões' : ''} pendente${pendingCount !== 1 ? 's' : ''}`}
        </p>
      </div>
      <AdminUsersTabs
        users={users as any}
        groups={groups}
        requests={requests as any}
        currentUserRole={user.role}
        pendingCount={pendingCount}
      />
    </div>
  );
}
