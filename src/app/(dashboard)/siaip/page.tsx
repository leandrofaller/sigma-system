import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { FaccoesClient } from '@/components/faccoes/FaccoesClient'

export const metadata = { title: 'SIAIP — Consulta de Apenados' }

export default async function SiaipPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return <FaccoesClient mode="readonly" />
}
