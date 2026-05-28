import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { FaccoesClient } from '@/components/faccoes/FaccoesClient'

export const metadata = { title: 'Apenados & Facções' }

export default async function FaccoesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return <FaccoesClient />
}
