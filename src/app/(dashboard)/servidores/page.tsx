import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ServidoresClient } from '@/components/servidores/ServidoresClient';

export const metadata = { title: 'Módulo de Servidores' };

export default async function ServidoresPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return <ServidoresClient />;
}
