'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AIPDashboard } from './AIPDashboard'
import { AIPanel } from './AIPanel'
import { AIPFaccoesPanel } from './AIPFaccoesPanel'
import { AIPAdvogadosPanel } from './AIPAdvogadosPanel'
import { AIPVisitantesPanel } from './AIPVisitantesPanel'
import { AIPVinculosPanel } from './AIPVinculosPanel'
import { Brain, BarChart2, Users, Shield, Briefcase, Camera, Link2, Map } from 'lucide-react'
import { MapaFaccoesClient, type PendingMapaLink } from '@/components/mapa-faccoes/MapaFaccoesClient'
import type { AIPApenado } from './AIPanel'

interface AIPClientProps {
  userRole: string
  userId?: string
  userName?: string
}

export function AIPClient({ userRole }: AIPClientProps) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [preselectedSipeId, setPreselectedSipeId] = useState<number | null>(null)
  const [highlightAipApenadoId, setHighlightAipApenadoId] = useState<string | null>(null)
  const [pendingMapaLink, setPendingMapaLink] = useState<PendingMapaLink | null>(null)
  const [mapaRefreshKey, setMapaRefreshKey] = useState(0)

  const handleViewVinculos = (sipeId: number) => {
    setPreselectedSipeId(sipeId)
    setActiveTab('vinculos')
  }

  const handleViewMapa = (apenado: AIPApenado) => {
    setHighlightAipApenadoId(null)
    setPendingMapaLink(null)

    if (apenado.temMapaVinculo) {
      setHighlightAipApenadoId(apenado.id)
    } else if (apenado.unidade) {
      setPendingMapaLink({
        aipApenadoId: apenado.id,
        nome: apenado.nome,
        unidade: apenado.unidade,
        sipeId: apenado.sipeId,
      })
    }

    setActiveTab('mapa')
  }

  const handleMapaLinked = () => {
    setPendingMapaLink(null)
    setMapaRefreshKey((k) => k + 1)
  }

  const triggerClass = "gap-2 flex-shrink-0 py-2.5 md:py-1.5 px-4 rounded-xl text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-900 dark:text-white data-[state=active]:shadow-sm snap-start"

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
          <div className="relative w-full overflow-hidden mb-4 shrink-0">
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-50 dark:from-gray-950 to-transparent pointer-events-none md:hidden z-10" />
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-50 dark:from-gray-950 to-transparent pointer-events-none md:hidden z-10" />

            <TabsList className="w-full md:w-fit overflow-x-auto flex md:inline-flex justify-start whitespace-nowrap scrollbar-none gap-1.5 bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-2xl h-auto snap-x snap-mandatory scroll-smooth">
              <TabsTrigger value="dashboard" className={triggerClass}>
                <BarChart2 className="w-4 h-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="apenados" className={triggerClass}>
                <Users className="w-4 h-4" />
                Apenados
              </TabsTrigger>
              <TabsTrigger value="vinculos" className={triggerClass}>
                <Link2 className="w-4 h-4" />
                Vínculos
              </TabsTrigger>
              <TabsTrigger value="faccoes" className={triggerClass}>
                <Shield className="w-4 h-4" />
                Facções
              </TabsTrigger>
              <TabsTrigger value="advogados" className={triggerClass}>
                <Briefcase className="w-4 h-4" />
                Advogados
              </TabsTrigger>
              <TabsTrigger value="visitantes" className={triggerClass}>
                <Camera className="w-4 h-4" />
                Visitantes
              </TabsTrigger>
              <TabsTrigger value="mapa" className={triggerClass}>
                <Map className="w-4 h-4" />
                Mapa Facções
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <AIPDashboard />
          </TabsContent>

          <TabsContent value="apenados" className="flex-1 min-h-0 mt-0">
            <AIPanel
              userRole={userRole}
              onViewVinculos={handleViewVinculos}
              onViewMapa={handleViewMapa}
              mapaRefreshKey={mapaRefreshKey}
            />
          </TabsContent>

          <TabsContent value="vinculos" className="flex-1 min-h-0 mt-0">
            <AIPVinculosPanel
              userRole={userRole}
              preselectedSipeId={preselectedSipeId}
              onClearPreselected={() => setPreselectedSipeId(null)}
            />
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

          <TabsContent value="mapa" className="flex-1 min-h-0 mt-0 overflow-hidden">
            <MapaFaccoesClient
              embedded
              highlightAipApenadoId={highlightAipApenadoId}
              onClearHighlight={() => setHighlightAipApenadoId(null)}
              pendingMapaLink={pendingMapaLink}
              onClearPendingMapaLink={() => setPendingMapaLink(null)}
              onMapaLinked={handleMapaLinked}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
