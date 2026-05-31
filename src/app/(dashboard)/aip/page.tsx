import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AIPanel } from '@/components/faccoes/AIPanel'

export const metadata = { title: 'AIP — Análise de Inteligência Penal' }

export default async function AipPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'OPERATOR') {
    redirect('/dashboard')
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Análise de Inteligência Penal
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Análise integrada de dados de apenados com informações de inteligência
        </p>
      </div>

      {/* Painel AIP */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <AIPanel />
      </div>
    </div>
  )
}
