import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ConfigPanel } from '@/components/admin/ConfigPanel';

async function getConfigs() {
  const configs = await prisma.systemConfig.findMany();
  return Object.fromEntries(configs.map((c) => [c.key, c.value]));
}

export default async function ConfiguracoesPage() {
  const session = await auth();
  const user = session!.user as any;

  if (user.role !== 'SUPER_ADMIN') {
    redirect('/dashboard');
  }

  const configs = await getConfigs();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações do Sistema</h1>
        <p className="text-gray-500 text-sm mt-1">
          Gerencie todos os aspectos do sistema
        </p>
      </div>
      <ConfigPanel configs={configs} />
    </div>
  );
}
