import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ApenadosClient } from '@/components/apenados/ApenadosClient';

export const metadata = { title: 'Identificação de Apenados' };

export default async function ApenadosPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const apenados = await prisma.apenado.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      matricula: true,
      unidade: true,
      photoPath: true,
      notes: true,
      createdAt: true,
    },
  });

  const user = session.user as any;

  return (
    <ApenadosClient
      initialApenados={apenados}
      userRole={user.role}
    />
  );
}
