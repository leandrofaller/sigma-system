import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { GeoMonitorPanel } from '@/components/admin/GeoMonitorPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Monitoramento — SIGMA' };

export default async function MonitoramentoPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') redirect('/dashboard');

  let locations: any[] = [];
  let allUsers: any[] = [];
  let tablesMissing = false;

  try {
    const [locs, users] = await Promise.all([
      prisma.userLocation.findMany({
        orderBy: { timestamp: 'desc' },
        take: 500,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    locations = locs;
    allUsers = users;
  } catch (err: any) {
    const msg: string = err?.message ?? '';
    const isTableMissing =
      err?.code === 'P2021' ||
      err?.meta?.code === '42P01' ||  // PostgreSQL: relation does not exist
      msg.includes('does not exist') ||
      msg.includes('relation') ||
      msg.includes('user_locations');
    if (isTableMissing) {
      tablesMissing = true;
    } else {
      throw err;
    }
  }

  // Serialize dates
  const serialized = locations.map((l) => ({
    ...l,
    timestamp: l.timestamp.toISOString(),
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-title">Monitoramento de Localização</h1>
        <p className="text-sm text-subtle mt-1">
          Visualize em tempo real a última posição registrada de cada usuário. Os dados são coletados no login com permissão do navegador.
        </p>
      </div>
      {tablesMissing ? (
        <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-6 text-amber-300 text-sm space-y-2">
          <p className="font-semibold">Tabela de localização não encontrada no banco de dados.</p>
          <p className="text-amber-400/80">Execute a migração do Prisma para criar a tabela <code className="bg-amber-900/40 px-1 rounded">user_locations</code>:</p>
          <pre className="bg-gray-900 text-gray-300 rounded-lg p-3 text-xs overflow-x-auto">npx prisma migrate deploy</pre>
        </div>
      ) : (
        <GeoMonitorPanel
          locations={serialized as any}
          allUsers={allUsers as any}
        />
      )}
    </div>
  );
}
