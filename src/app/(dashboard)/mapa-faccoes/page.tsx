import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MapaFaccoesClient } from '@/components/mapa-faccoes/MapaFaccoesClient'

export const metadata = { title: 'Mapa de Facções — Rondônia' }

export default async function MapaFaccoesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    redirect('/dashboard')
  }

  return <MapaFaccoesClient />
}