import { requirePageAccess } from '@/lib/require-page-access';
import { PichacoesClient } from '@/components/faccoes/PichacoesClient';

export const metadata = {
  title: 'Mapeamento de Pichações e Simbologias - Agência de Inteligência',
  description: 'Registro e georreferenciamento de marcas territoriais e pichações de facções criminosas.',
};

export default async function PichacoesPage() {
  const user = await requirePageAccess('pichacoes');

  return (
    <PichacoesClient
      userRole={user.role}
      currentUserId={user.id}
      currentUserName={user.name || ''}
    />
  );
}
