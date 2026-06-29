import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ListaEnderecosClient } from '@/components/enderecos/ListaEnderecosClient'

export const metadata = { title: 'Lista de Endereços — Unidades Prisionais RO' }

export default async function ListaEnderecosPage({
  searchParams,
}: {
  searchParams: Promise<{ unidade?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    redirect('/dashboard')
  }

  const params = await searchParams

  return <ListaEnderecosClient initialUnidadeId={params.unidade ?? null} />
}