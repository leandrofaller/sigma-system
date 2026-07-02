import { requirePageAccess } from '@/lib/require-page-access'
import ManutencaoClient from './client'

export default async function ManutencaoPage() {
  await requirePageAccess('admin-manutencao')

  return <ManutencaoClient />
}
