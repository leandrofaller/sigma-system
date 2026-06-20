import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { VisitantesClient } from '@/components/visitantes/VisitantesClient';

export const metadata = { title: 'Módulo de Visitantes' };

export default async function VisitantesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return <VisitantesClient />;
}
