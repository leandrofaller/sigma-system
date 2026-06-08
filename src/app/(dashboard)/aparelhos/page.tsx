import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AparelhosClient } from '@/components/aparelhos/AparelhosClient'

export const metadata = { title: 'Celulares Recebidos — GIP' }

export default async function AparelhosPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return <AparelhosClient />
}
