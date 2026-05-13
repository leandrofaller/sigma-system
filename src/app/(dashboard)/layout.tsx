import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { Toaster } from '@/components/ui/Toaster';
import { prisma } from '@/lib/db';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  let logoSize = 36;
  try {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: 'sidebar_logo_size' } });
    const px = (cfg?.value as any)?.px;
    if (typeof px === 'number' && px > 0) logoSize = px;
  } catch {}

  return (
    <QueryProvider>
      <div className="flex h-screen min-h-[100dvh] bg-gray-50 dark:bg-gray-950 overflow-hidden">
        <Sidebar user={session.user as any} logoSize={logoSize} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header user={session.user as any} />
          <main className="flex-1 overflow-auto p-3 md:p-6">
            {children}
          </main>
        </div>
      </div>
      <Toaster />
    </QueryProvider>
  );
}
