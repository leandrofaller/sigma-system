'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApenadosImportados } from './ApenadosImportados'
import { UnidadesDashboard } from './UnidadesDashboard'
import { Building2, Users, BarChart2 } from 'lucide-react'

export function UnidadesPrisionaisClient() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 md:px-6 py-3.5 md:py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Unidades Prisionais</h1>
            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
              Visualização consolidada e isolada de apenados por unidades prisionais (Scraping de Unidades)
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 p-3 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <div className="relative w-full overflow-hidden mb-4 shrink-0">
            <TabsList className="w-full md:w-fit overflow-x-auto flex md:inline-flex justify-start whitespace-nowrap scrollbar-none gap-1.5 bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-2xl h-auto">
              <TabsTrigger value="dashboard" className="gap-2 flex-shrink-0 py-2.5 md:py-1.5 px-4 rounded-xl text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-900 dark:text-white data-[state=active]:shadow-sm">
                <BarChart2 className="w-4 h-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="apenados" className="gap-2 flex-shrink-0 py-2.5 md:py-1.5 px-4 rounded-xl text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-900 dark:text-white data-[state=active]:shadow-sm">
                <Users className="w-4 h-4" />
                Apenados
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <UnidadesDashboard endpoint="/api/sipe/unidades-prisionais/stats" />
          </TabsContent>

          <TabsContent value="apenados" className="flex-1 min-h-0 mt-0">
            <ApenadosImportados 
              apiEndpoint="/api/sipe/unidades-prisionais" 
              apiPhotoPrefix="/api/sipe/unidades-prisionais" 
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
