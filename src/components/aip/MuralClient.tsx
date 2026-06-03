'use client'

import { useState, useEffect } from 'react'
import { Calendar, Plus, Filter, Clock, FolderOpen } from 'lucide-react'
import { EventCalendar } from './mural/EventCalendar'
import { EventModal } from './mural/EventModal'
import { EventList } from './mural/EventList'
import { ApprovalPanel } from './mural/ApprovalPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function MuralClient({ userRole }: { userRole: string }) {
  const [view, setView] = useState<'calendar' | 'list' | 'approvals'>('calendar')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [categoria, setCategoria] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Calendar className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Mural de Eventos
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Calendário de ocorrências com anexos e documentos
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Evento
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 p-6">
        <Tabs value={view} onValueChange={(v: any) => setView(v)} className="flex flex-col h-full">
          <TabsList className="mb-4 w-fit">
            <TabsTrigger value="calendar" className="gap-2">
              <Calendar className="w-4 h-4" />
              Calendário
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Lista
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="approvals" className="gap-2">
                <Clock className="w-4 h-4" />
                Aprovações
              </TabsTrigger>
            )}
          </TabsList>

          {/* Calendário */}
          <TabsContent value="calendar" className="flex-1 min-h-0 mt-0">
            <EventCalendar
              mes={mes}
              onMesChange={setMes}
              onDateSelect={setSelectedDate}
              refreshTrigger={refreshTrigger}
            />
          </TabsContent>

          {/* Lista */}
          <TabsContent value="list" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <div className="space-y-4">
              {/* Filtros */}
              <div className="flex gap-3 items-center pb-4 border-b border-gray-200 dark:border-gray-700">
                <Filter className="w-4 h-4 text-gray-500" />
                <input
                  type="month"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                  className="input-base px-3 py-2 text-sm"
                />
                <select
                  value={categoria || ''}
                  onChange={(e) => setCategoria(e.target.value || null)}
                  className="input-base px-3 py-2 text-sm"
                >
                  <option value="">Todas as categorias</option>
                  <option value="Movimento">Movimento</option>
                  <option value="Conflito">Conflito</option>
                  <option value="Inteligência">Inteligência</option>
                  <option value="Segurança">Segurança</option>
                  <option value="Administrativo">Administrativo</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              {/* Lista de eventos */}
              <EventList
                mes={mes}
                categoria={categoria}
                refreshTrigger={refreshTrigger}
                onEventUpdated={() => setRefreshTrigger((p) => p + 1)}
              />
            </div>
          </TabsContent>

          {/* Aprovações */}
          {isAdmin && (
            <TabsContent value="approvals" className="flex-1 min-h-0 mt-0 overflow-y-auto">
              <ApprovalPanel
                refreshTrigger={refreshTrigger}
                onApprovalComplete={() => setRefreshTrigger((p) => p + 1)}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Modal de Novo Evento */}
      {isModalOpen && (
        <EventModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onEventCreated={() => {
            setRefreshTrigger((p) => p + 1)
            setIsModalOpen(false)
          }}
        />
      )}
    </div>
  )
}
