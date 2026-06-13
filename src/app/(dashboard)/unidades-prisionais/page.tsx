import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { UnidadesPrisionaisClient } from '@/components/faccoes/UnidadesPrisionaisClient'

export const metadata = { title: 'Unidades Prisionais — Consulta Isolada' }

export default async function UnidadesPrisionaisPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  
  // Garantia de acesso restrito apenas ao Superadmin
  if (user.role !== 'SUPER_ADMIN') {
    redirect('/dashboard')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <UnidadesPrisionaisClient />
    </div>
  )
}
