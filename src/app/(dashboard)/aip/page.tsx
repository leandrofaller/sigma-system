import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AIPClient } from '@/components/faccoes/AIPClient'

export const metadata = { title: 'AIP — Análise de Inteligência Penal' }

export default async function AipPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'OPERATOR') {
    redirect('/dashboard')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <AIPClient userRole={user.role} />
    </div>
  )
}
