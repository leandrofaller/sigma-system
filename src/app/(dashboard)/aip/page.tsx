import { requirePageAccess } from '@/lib/require-page-access'
import { AIPClient } from '@/components/faccoes/AIPClient'

export const metadata = { title: 'AIP — Análise de Inteligência Penal' }

export default async function AipPage() {
  const user = await requirePageAccess('aip')

  return (
    <div className="flex flex-col h-full min-h-0">
      <AIPClient userRole={user.role} />
    </div>
  )
}
