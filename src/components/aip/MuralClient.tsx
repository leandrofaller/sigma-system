'use client'

import { useState, useEffect } from 'react'
import { Calendar, Plus, Filter, Clock, FolderOpen, X, Eye } from 'lucide-react'
import { EventCalendar } from './mural/EventCalendar'
import { EventModal } from './mural/EventModal'
import { EventList } from './mural/EventList'
import { ApprovalPanel } from './mural/ApprovalPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function MuralClient({ userRole }: { userRole: string }) {
  const [view, setView] = useState<'calendar' | 'list' | 'approvals'>('calendar')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [mes, setMes] = useState(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  })
  const [categoria, setCategoria] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  
  // Novo modal de decisão e filtro
  const [decisionModal, setDecisionModal] = useState<{ isOpen: boolean; date: Date; count: number } | null>(null)
  const [diaFilter, setDiaFilter] = useState<Date | null>(null)

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
            onClick={() => {
              setSelectedDate(null)
              setIsModalOpen(true)
            }}
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
              onDateSelect={(date, count) => {
                setSelectedDate(date)
                if (count > 0) {
                  setDecisionModal({ isOpen: true, date, count })
                } else {
                  setIsModalOpen(true)
                }
              }}
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
                diaFilter={diaFilter}
                onClearDiaFilter={() => setDiaFilter(null)}
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
          onClose={() => {
            setIsModalOpen(false)
            setSelectedDate(null)
          }}
          onEventCreated={() => {
            setRefreshTrigger((p) => p + 1)
            setIsModalOpen(false)
            setSelectedDate(null)
          }}
          initialDate={selectedDate || undefined}
        />
      )}

      {/* Modal de Decisão (Visualizar ou Criar) */}
      {decisionModal?.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700 overflow-hidden transform transition-all">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-500" />
                Ocorrências em {new Date(decisionModal.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
              </h3>
              <button
                onClick={() => setDecisionModal(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Há <strong className="text-amber-600 dark:text-amber-400">{decisionModal.count} ocorrência(s)</strong> registrada(s) para este dia. O que você gostaria de fazer?
              </p>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    setDiaFilter(decisionModal.date)
                    setView('list')
                    setDecisionModal(null)
                  }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 rounded-lg font-semibold text-sm transition"
                >
                  <Eye className="w-4 h-4" />
                  Visualizar Ocorrências ({decisionModal.count})
                </button>
                
                <button
                  onClick={() => {
                    setIsModalOpen(true)
                    setDecisionModal(null)
                  }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-sm transition shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Registrar Nova Ocorrência
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setDecisionModal(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
