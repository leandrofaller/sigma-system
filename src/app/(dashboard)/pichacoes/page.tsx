import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PichacoesClient } from '@/components/faccoes/PichacoesClient';

export const metadata = {
  title: 'Mapeamento de Pichações e Simbologias - Agência de Inteligência',
  description: 'Registro e georreferenciamento de marcas territoriais e pichações de facções criminosas.',
};

export default async function PichacoesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const user = session.user as any;
  const role = user.role || 'OPERATOR';

  // Apenas operadores credenciados
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    redirect('/dashboard');
  }

  return (
    <PichacoesClient
      userRole={role}
      currentUserId={user.id}
      currentUserName={user.name || ''}
    />
  );
}
