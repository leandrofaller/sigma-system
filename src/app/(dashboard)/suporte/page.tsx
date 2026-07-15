import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SuporteClient } from '@/components/suporte/SuporteClient'

export const metadata = { title: 'Suporte — Canal Operacional' }

export default async function SuportePage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  return <SuporteClient user={session.user} />
}
