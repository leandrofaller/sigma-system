import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { DevicesPanel } from '@/components/admin/DevicesPanel';

async function getData() {
  const [devices, enforcementConfig] = await Promise.all([
    prisma.userDevice.findMany({
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.systemConfig.findUnique({ where: { key: 'device_auth_enabled' } }),
  ]);

  return {
    devices,
    enforcementEnabled: enforcementConfig?.value === true,
  };
}

export default async function DispositivosPage() {
  const session = await auth();
  const user = session!.user as any;

  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { devices, enforcementEnabled } = await getData();
  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">Dispositivos</h1>
        <p className="text-body text-sm mt-1">
          Gerencie os dispositivos que acessam o sistema
        </p>
      </div>
      <DevicesPanel
        initialDevices={devices as any}
        enforcementEnabled={enforcementEnabled}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
