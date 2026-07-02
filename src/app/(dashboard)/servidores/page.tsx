import { requirePageAccess } from '@/lib/require-page-access';
import { ServidoresClient } from '@/components/servidores/ServidoresClient';

export const metadata = { title: 'Módulo de Servidores' };

export default async function ServidoresPage() {
  await requirePageAccess('servidores');

  return <ServidoresClient />;
}
