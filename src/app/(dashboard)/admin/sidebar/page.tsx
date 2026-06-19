import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SidebarConfigManager } from '@/components/admin/SidebarConfigManager';
import { Shield } from 'lucide-react';

export default async function AdminSidebarPage() {
  const session = await auth();
  if (!session) {
    redirect('/login');
  }

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="p-4 bg-red-500/10 text-red-500 rounded-full border border-red-500/20">
          <Shield className="w-10 h-10" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-title">Acesso Restrito</h1>
          <p className="text-sm text-subtle max-w-sm">
            Esta página é exclusiva para o administrador de nível <strong>SUPER_ADMIN</strong>. Seu perfil atual não tem autorização para gerenciar a barra lateral do sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <div>
        <h1 className="text-2xl font-bold text-title">Personalização da Barra Lateral</h1>
        <p className="text-body text-sm mt-1">
          Gerencie e personalize dinamicamente os menus de navegação do SIAIP.
        </p>
      </div>

      <SidebarConfigManager />
    </div>
  );
}
