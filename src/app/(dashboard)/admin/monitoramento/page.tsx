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

  const [locations, allUsers] = await Promise.all([
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
      <GeoMonitorPanel
        locations={serialized as any}
        allUsers={allUsers as any}
      />
    </div>
  );
}
