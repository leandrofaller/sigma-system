import { requirePageAccess } from '@/lib/require-page-access'
import { UnidadesPrisionaisClient } from '@/components/faccoes/UnidadesPrisionaisClient'

export const metadata = { title: 'Unidades Prisionais — Consulta Isolada' }

export default async function UnidadesPrisionaisPage() {
  await requirePageAccess('unidades-prisionais')

  return (
    <div className="flex flex-col h-full min-h-0">
      <UnidadesPrisionaisClient />
    </div>
  )
}
