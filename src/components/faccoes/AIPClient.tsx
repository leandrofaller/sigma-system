'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AIPDashboard } from './AIPDashboard'
import { AIPanel } from './AIPanel'
import { AIPFaccoesPanel } from './AIPFaccoesPanel'
import { AIPAdvogadosPanel } from './AIPAdvogadosPanel'
import { AIPVisitantesPanel } from './AIPVisitantesPanel'
import { Brain, BarChart2, Users, Shield, Briefcase, Camera } from 'lucide-react'

interface AIPClientProps {
  userRole: string
}

export function AIPClient({ userRole }: AIPClientProps) {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 md:px-6 py-3.5 md:py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">
              AIP — Análise de Inteligência Penal
            </h1>
            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
              Dados de inteligência exclusivos dos apenados cadastrados no AIP
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 p-3 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <TabsList className="mb-4 w-full md:w-fit overflow-x-auto md:overflow-visible flex md:inline-flex justify-start whitespace-nowrap scrollbar-none gap-1 bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-2xl h-auto">
            <TabsTrigger value="dashboard" className="gap-2 flex-shrink-0 py-2 md:py-1.5 px-4 rounded-xl text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-900 dark:text-white data-[state=active]:shadow-sm">
              <BarChart2 className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="apenados" className="gap-2 flex-shrink-0 py-2 md:py-1.5 px-4 rounded-xl text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-900 dark:text-white data-[state=active]:shadow-sm">
              <Users className="w-4 h-4" />
              Apenados
            </TabsTrigger>
            <TabsTrigger value="faccoes" className="gap-2 flex-shrink-0 py-2 md:py-1.5 px-4 rounded-xl text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-900 dark:text-white data-[state=active]:shadow-sm">
              <Shield className="w-4 h-4" />
              Facções
            </TabsTrigger>
            <TabsTrigger value="advogados" className="gap-2 flex-shrink-0 py-2 md:py-1.5 px-4 rounded-xl text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-900 dark:text-white data-[state=active]:shadow-sm">
              <Briefcase className="w-4 h-4" />
              Advogados
            </TabsTrigger>
            <TabsTrigger value="visitantes" className="gap-2 flex-shrink-0 py-2 md:py-1.5 px-4 rounded-xl text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-900 dark:text-white data-[state=active]:shadow-sm">
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

          <TabsContent value="faccoes" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <AIPFaccoesPanel userRole={userRole} />
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
