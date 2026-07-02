import { requirePageAccess } from '@/lib/require-page-access';
import { VisitantesClient } from '@/components/visitantes/VisitantesClient';

export const metadata = { title: 'Módulo de Visitantes' };

export default async function VisitantesPage() {
  await requirePageAccess('visitantes');

  return <VisitantesClient />;
}
