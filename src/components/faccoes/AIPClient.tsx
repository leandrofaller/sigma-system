'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AIPDashboard } from './AIPDashboard'
import { AIPanel } from './AIPanel'
import { AIPAdvogadosPanel } from './AIPAdvogadosPanel'
import { AIPVisitantesPanel } from './AIPVisitantesPanel'
import { Brain, BarChart2, Users, Briefcase, Camera } from 'lucide-react'

interface AIPClientProps {
  userRole: string
}

export function AIPClient({ userRole }: AIPClientProps) {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              AIP — Análise de Inteligência Penal
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Dados de inteligência exclusivos dos apenados cadastrados no AIP
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <TabsList className="mb-4 w-fit">
            <TabsTrigger value="dashboard" className="gap-2">
              <BarChart2 className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="apenados" className="gap-2">
              <Users className="w-4 h-4" />
              Apenados
            </TabsTrigger>
            <TabsTrigger value="advogados" className="gap-2">
              <Briefcase className="w-4 h-4" />
              Advogados
            </TabsTrigger>
            <TabsTrigger value="visitantes" className="gap-2">
              <Camera className="w-4 h-4" />
              Visitantes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <AIPDashboard />
          </TabsContent>

          <TabsContent value="apenados" className="flex-1 min-h-0 mt-0">
            <AIPanel userRole={userRole} />
          </TabsContent>

          <TabsContent value="advogados" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <AIPAdvogadosPanel />
          </TabsContent>

          <TabsContent value="visitantes" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <AIPVisitantesPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
