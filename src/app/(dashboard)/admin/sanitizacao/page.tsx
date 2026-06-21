import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SanitizationPanel } from '@/components/admin/SanitizationPanel';
import { Shield } from 'lucide-react';

export default async function AdminSanitizacaoPage() {
  const session = await auth();
  if (!session) {
    redirect('/login');
  }

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="p-4 bg-red-500/10 text-red-500 rounded-full border border-red-500/20">
          <Shield className="w-10 h-10" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-title">Acesso Restrito</h1>
          <p className="text-sm text-subtle max-w-sm">
            Esta página é exclusiva para administradores (<strong>SUPER_ADMIN</strong> ou <strong>ADMIN</strong>). Seu perfil não possui permissões necessárias para acessar a higienização de imagens.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <SanitizationPanel />
    </div>
  );
}
