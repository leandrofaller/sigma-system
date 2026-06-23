'use client'

import { ClipboardList } from 'lucide-react'
import { OrdemMissaoPanel } from './OrdemMissaoPanel'

interface Props {
  userRole: string
  userId: string
  userName: string
}

export function OrdemMissaoClient({ userRole, userId, userName }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 md:px-6 py-3.5 md:py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <ClipboardList className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">
              Ordens de Missão
            </h1>
            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
              Emissão e controle de ordens com ciência digital dos agentes
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-3 md:p-6 overflow-y-auto">
        <OrdemMissaoPanel
          userRole={userRole}
          currentUserId={userId}
          currentUserName={userName}
        />
      </div>
    </div>
  )
}
