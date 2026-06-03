'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

interface EventListProps {
  mes: string
  categoria: string | null
  refreshTrigger: number
  onEventUpdated: () => void
}

export function EventList({ mes, categoria, refreshTrigger, onEventUpdated }: EventListProps) {
  const [eventos, setEventos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadEvents() {
      setLoading(true)
      try {
        let url = `/api/events?mes=${mes}`
        if (categoria) url += `&categoria=${categoria}`

        const res = await fetch(url)
        const data = await res.json()
        setEventos(data.eventos || [])
      } catch (err) {
        console.error('Erro ao carregar eventos:', err)
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [mes, categoria, refreshTrigger])

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  return (
    <div className="space-y-3">
      {eventos.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Nenhum evento encontrado</div>
      ) : (
        eventos.map((evento) => (
          <div key={evento.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">{evento.titulo}</h3>
                {evento.descricao && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{evento.descricao}</p>}
                <div className="flex gap-3 mt-2 text-xs text-gray-500">
                  <span>{new Date(evento.dataEvento).toLocaleDateString('pt-BR')}</span>
                  {evento.categoria && <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 rounded">{evento.categoria}</span>}
                  <span>{evento.anexos?.length || 0} anexos</span>
                </div>
              </div>
              <button className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition">
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
