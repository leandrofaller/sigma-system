'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CalendarDayWithEvents {
  day: number
  date: Date
  eventsCount: number
  hasEvents: boolean
}

interface EventCalendarProps {
  mes: string // YYYY-MM
  onMesChange: (mes: string) => void
  onDateSelect: (date: Date, eventsCount: number) => void
  refreshTrigger: number
}

export function EventCalendar({
  mes,
  onMesChange,
  onDateSelect,
  refreshTrigger,
}: EventCalendarProps) {
  const [dias, setDias] = useState<CalendarDayWithEvents[]>([])
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({})

  // Carregar eventos do mês
  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch(`/api/events?mes=${mes}`)
        const data = await res.json()

        // Contar eventos por dia
        const counts: Record<string, number> = {}
        if (data && Array.isArray(data.eventos)) {
          for (const evento of data.eventos) {
            if (evento.dataEvento) {
              try {
                const dia = new Date(evento.dataEvento).toISOString().split('T')[0]
                counts[dia] = (counts[dia] || 0) + 1
              } catch (e) {
                console.error('Erro ao converter data do evento:', e)
              }
            }
          }
        }

        setEventCounts(counts)
      } catch (err) {
        console.error('Erro ao carregar eventos:', err)
      }
    }

    loadEvents()
  }, [mes, refreshTrigger])

  // Gerar dias do calendário
  useEffect(() => {
    const [ano, mesNum] = mes.split('-').map(Number)
    const data = new Date(ano, mesNum - 1, 1)
    const diasNoMes = new Date(ano, mesNum, 0).getDate()
    const primeiraSegunda = data.getDay()

    const diasArray: CalendarDayWithEvents[] = []

    // Dias vazios do mês anterior
    for (let i = 0; i < primeiraSegunda; i++) {
      diasArray.push({
        day: 0,
        date: new Date(),
        eventsCount: 0,
        hasEvents: false,
      })
    }

    // Dias do mês
    for (let i = 1; i <= diasNoMes; i++) {
      const data = new Date(ano, mesNum - 1, i)
      const diaKey = data.toISOString().split('T')[0]
      const count = eventCounts[diaKey] || 0

      diasArray.push({
        day: i,
        date: data,
        eventsCount: count,
        hasEvents: count > 0,
      })
    }

    setDias(diasArray)
  }, [mes, eventCounts])

  const [ano, mesNum] = mes.split('-').map(Number)
  const mesNome = new Date(ano, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  const handlePreviousMonth = () => {
    const data = new Date(ano, mesNum - 2)
    onMesChange(data.toISOString().slice(0, 7))
  }

  const handleNextMonth = () => {
    const data = new Date(ano, mesNum)
    onMesChange(data.toISOString().slice(0, 7))
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize text-gray-900 dark:text-white">
          {mesNome}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handlePreviousMonth}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={handleNextMonth}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Dias da semana */}
      <div className="grid grid-cols-7 gap-2">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((dia) => (
          <div
            key={dia}
            className="text-center text-sm font-semibold text-gray-500 dark:text-gray-400 py-2"
          >
            {dia}
          </div>
        ))}
      </div>

      {/* Calendário */}
      <div className="grid grid-cols-7 gap-2">
        {dias.map((dia, idx) => (
          <button
            key={idx}
            onClick={() => dia.day > 0 && onDateSelect(dia.date, dia.eventsCount)}
            disabled={dia.day === 0}
            className={`
              aspect-square rounded-lg border-2 font-medium transition-all
              flex flex-col items-center justify-center gap-1 text-sm
              ${
                dia.day === 0
                  ? 'bg-gray-50 dark:bg-gray-900 border-transparent cursor-default'
                  : dia.hasEvents
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 hover:shadow-md'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:border-amber-300 dark:hover:border-amber-700'
              }
            `}
          >
            {dia.day > 0 && (
              <>
                <span>{dia.day}</span>
                {dia.hasEvents && (
                  <span className="text-xs font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                    {dia.eventsCount}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      {/* Legenda */}
      <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400 px-4 py-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gray-200 dark:bg-gray-700" />
          <span>Sem eventos</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-amber-300 dark:bg-amber-700" />
          <span>Com eventos</span>
        </div>
      </div>
    </div>
  )
}
