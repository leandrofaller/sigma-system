import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MuralClient } from '@/components/aip/MuralClient'

export const metadata = {
  title: 'Mural de Eventos',
  description: 'Calendário de ocorrências com anexos e documentos',
}

export default async function MuralPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const userRole = (session.user as any).role || 'OPERATOR'

  return (
    <div className="h-full">
      <MuralClient userRole={userRole} />
    </div>
  )
}
