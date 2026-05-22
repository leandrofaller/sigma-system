import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { HeartbeatProvider } from '@/components/providers/HeartbeatProvider';
import { IndexingWrapper } from '@/components/providers/IndexingWrapper';
import { Toaster } from '@/components/ui/Toaster';
import { prisma } from '@/lib/db';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  let logoSize = 36;
  let pendingDeviceCount = 0;
  try {
    const [cfg, deviceCount] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: 'sidebar_logo_size' } }),
      isAdmin
        ? prisma.userDevice.count({ where: { status: 'PENDING' } })
        : Promise.resolve(0),
    ]);
    const px = (cfg?.value as any)?.px;
    if (typeof px === 'number' && px > 0) logoSize = px;
    pendingDeviceCount = deviceCount;
  } catch {}

  return (
    <QueryProvider>
      <IndexingWrapper>
        <div className="flex h-screen min-h-[100dvh] bg-gray-50 dark:bg-gray-950 overflow-hidden">
          <Sidebar user={session.user as any} logoSize={logoSize} pendingDeviceCount={pendingDeviceCount} />
          <div className="flex-1 flex flex-col min-w-0">
            <Header user={session.user as any} />
            <main className="flex-1 overflow-auto p-3 md:p-6">
              {children}
            </main>
          </div>
        </div>
        <HeartbeatProvider />
        <Toaster />
      </IndexingWrapper>
    </QueryProvider>
  );
}
