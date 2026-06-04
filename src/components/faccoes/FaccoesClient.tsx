'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SyncPanel } from './SyncPanel'
import { ApenadosImportados } from './ApenadosImportados'
import { AdvogadosImportados } from './AdvogadosImportados'
import { FaccoesPanel } from './FaccoesPanel'
import { DashboardPanel } from './DashboardPanel'
import { UnidadesPanel } from './UnidadesPanel'
import { SipeVisitantesPanel } from './SipeVisitantesPanel'
import { Shield, Users, Briefcase, RefreshCw, BarChart2, Building2, Database, Camera } from 'lucide-react'

interface FaccoesClientProps {
  /** 'admin' = visão completa com Sincronização; 'readonly' = espelho sem sync (SIAIP) */
  mode?: 'admin' | 'readonly'
}

export function FaccoesClient({ mode = 'admin' }: FaccoesClientProps) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const showSync = mode === 'admin'

  // Cabeçalho dinâmico baseado no modo
  const headerIcon = showSync ? Shield : Database
  const HeaderIcon = headerIcon
  const headerTitle = showSync ? 'Apenados & Facções' : 'SIAIP — Consulta de Apenados'
  const headerSubtitle = showSync
    ? 'Dados integrados do SIPE — vínculos entre apenados, facções, advogados e visitantes'
    : 'Visualização integrada de apenados, facções, advogados e visitantes do SIPE'
  const headerBg = showSync ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
  const headerIconColor = showSync ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className={`p-2 ${headerBg} rounded-lg`}>
            <HeaderIcon className={`w-5 h-5 ${headerIconColor}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{headerTitle}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {headerSubtitle}
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
            <TabsTrigger value="faccoes" className="gap-2">
              <Shield className="w-4 h-4" />
              Facções
            </TabsTrigger>
            <TabsTrigger value="advogados" className="gap-2">
              <Briefcase className="w-4 h-4" />
              Advogados
            </TabsTrigger>
            <TabsTrigger value="unidades" className="gap-2">
              <Building2 className="w-4 h-4" />
              Unidades
            </TabsTrigger>
            <TabsTrigger value="visitantes" className="gap-2">
              <Camera className="w-4 h-4" />
              Visitantes
            </TabsTrigger>
            {showSync && (
              <TabsTrigger value="sync" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Sincronização
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="dashboard" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <DashboardPanel />
          </TabsContent>

          <TabsContent value="apenados" className="flex-1 min-h-0 mt-0">
            <ApenadosImportados />
          </TabsContent>

          <TabsContent value="faccoes" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <FaccoesPanel />
          </TabsContent>

          <TabsContent value="advogados" className="flex-1 min-h-0 mt-0">
            <AdvogadosImportados />
          </TabsContent>

          <TabsContent value="unidades" className="flex-1 min-h-0 mt-0">
            <UnidadesPanel />
          </TabsContent>

          <TabsContent value="visitantes" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <SipeVisitantesPanel />
          </TabsContent>

          {showSync && (
            <TabsContent value="sync" className="flex-1 min-h-0 mt-0 overflow-y-auto">
              <SyncPanel />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
