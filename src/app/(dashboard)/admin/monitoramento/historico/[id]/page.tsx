import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import OfficerLocationHistory from './client'

/**
 * Página de histórico de localização de um policial
 * Apenas SUPER_ADMIN e ADMIN podem acessar
 */
export default async function HistoricPageServer({
  params,
}: {
  params: { id: string }
}) {
  // Auth check
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const userRole = (session.user as any)?.role
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    redirect('/dashboard')
  }

  // Buscar info do policial
  const officer = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  })

  if (!officer) {
    redirect('/admin/monitoramento')
  }

  // Buscar número de registros
  const totalLocations = await prisma.officerLocationTracking.count({
    where: { userId: params.id },
  })

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{officer.name}</h1>
            <p className="text-gray-600 mt-1">{officer.email}</p>
            <p className="text-sm text-gray-500 mt-2">
              Total de registros: <strong>{totalLocations}</strong>
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-900 rounded-full text-sm font-semibold">
              {officer.role}
            </span>
          </div>
        </div>
      </div>

      {/* Histórico Client Component */}
      <OfficerLocationHistory officerId={params.id} />
    </div>
  )
}
