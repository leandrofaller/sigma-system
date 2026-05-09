import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { AuditTable } from '@/components/admin/AuditTable';

async function getAuditLogs(page = 1, pageSize = 50) {
  const skip = (page - 1) * pageSize;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count(),
  ]);
  return { logs, total, totalPages: Math.ceil(total / pageSize) };
}

export default async function AuditoriaPage() {
  const session = await auth();
  const user = session!.user as any;

  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { logs, total } = await getAuditLogs();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">Auditoria do Sistema</h1>
        <p className="text-body text-sm mt-1">
          Registro de todas as ações — {total} evento{total !== 1 ? 's' : ''} no total
        </p>
      </div>
      <AuditTable logs={logs as any} />
    </div>
  );
}
