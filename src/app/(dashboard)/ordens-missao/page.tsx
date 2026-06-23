import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { OrdemMissaoClient } from '@/components/faccoes/OrdemMissaoClient'

export const metadata = { title: 'Ordens de Missão — AIP' }

export default async function OrdensMissaoPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(user.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <OrdemMissaoClient userRole={user.role} userId={user.id} userName={user.name} />
    </div>
  )
}
