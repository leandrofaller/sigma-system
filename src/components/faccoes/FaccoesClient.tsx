'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SyncPanel } from './SyncPanel'
import { ApenadosImportados } from './ApenadosImportados'
import { AdvogadosImportados } from './AdvogadosImportados'
import { FaccoesPanel } from './FaccoesPanel'
import { Shield, Users, Briefcase, RefreshCw } from 'lucide-react'

export function FaccoesClient() {
  const [activeTab, setActiveTab] = useState('apenados')

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <Shield className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Apenados & Facções</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Dados integrados do SIPE — vínculos entre apenados, facções, advogados e visitantes
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <TabsList className="mb-4 w-fit">
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
            <TabsTrigger value="sync" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Sincronização
            </TabsTrigger>
          </TabsList>

          <TabsContent value="apenados" className="flex-1 min-h-0 mt-0">
            <ApenadosImportados />
          </TabsContent>

          <TabsContent value="faccoes" className="flex-1 min-h-0 mt-0">
            <FaccoesPanel />
          </TabsContent>

          <TabsContent value="advogados" className="flex-1 min-h-0 mt-0">
            <AdvogadosImportados />
          </TabsContent>

          <TabsContent value="sync" className="flex-1 min-h-0 mt-0">
            <SyncPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
