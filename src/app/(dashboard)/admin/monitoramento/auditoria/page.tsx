import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import LocationAuditClient from './client'

/**
 * Página de auditoria de localizações
 * Mostra todos os acessos feitos por administradores
 */
export default async function AuditoriaPage() {
  // Auth check
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const userRole = (session.user as any)?.role
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-3xl font-bold text-gray-900">
          📋 Auditoria de Localizações
        </h1>
        <p className="text-gray-600 mt-2">
          Visualize todos os acessos a dados de localização realizados por administradores.
          Cada acesso é registrado com data, hora, IP e ação realizada.
        </p>
      </div>

      {/* Auditoria Client Component */}
      <LocationAuditClient />
    </div>
  )
}
