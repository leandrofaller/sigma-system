import { requirePageAccess } from '@/lib/require-page-access'
import { FaccoesClient } from '@/components/faccoes/FaccoesClient'

export const metadata = { title: 'Apenados & Facções' }

export default async function FaccoesPage() {
  await requirePageAccess('faccoes')

  return <FaccoesClient />
}
