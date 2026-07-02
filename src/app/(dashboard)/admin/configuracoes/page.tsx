import { requirePageAccess } from '@/lib/require-page-access';
import { prisma } from '@/lib/db';
import { ConfigPanel } from '@/components/admin/ConfigPanel';
import { LogosPanel } from '@/components/admin/LogosPanel';
import { ConfigTabs } from '@/components/admin/ConfigTabs';

async function getConfigs() {
  const configs = await prisma.systemConfig.findMany();
  return Object.fromEntries(configs.map((c) => [c.key, c.value]));
}

export default async function ConfiguracoesPage() {
  await requirePageAccess('admin-configuracoes');

  const configs = await getConfigs();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">Configurações do Sistema</h1>
        <p className="text-body text-sm mt-1">Gerencie todos os aspectos do sistema</p>
      </div>
      <ConfigTabs configs={configs} />
    </div>
  );
}
