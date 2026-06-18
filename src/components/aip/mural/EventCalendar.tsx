'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'

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
    const data = new Date(Date.UTC(ano, mesNum - 1, 1))
    const diasNoMes = new Date(Date.UTC(ano, mesNum, 0)).getUTCDate()
    
    // getUTCDay() retorna: 0 = Domingo, 1 = Segunda, etc.
    // Como a semana no cabeçalho começa na Segunda, calculamos o offset:
    const offset = (data.getUTCDay() + 6) % 7

    const diasArray: CalendarDayWithEvents[] = []

    // Dias vazios do mês anterior
    for (let i = 0; i < offset; i++) {
      diasArray.push({
        day: 0,
        date: new Date(Date.UTC(ano, mesNum - 1, 1)),
        eventsCount: 0,
        hasEvents: false,
      })
    }

    // Dias do mês
    for (let i = 1; i <= diasNoMes; i++) {
      const dataDia = new Date(Date.UTC(ano, mesNum - 1, i))
      const diaKey = dataDia.toISOString().split('T')[0]
      const count = eventCounts[diaKey] || 0

      diasArray.push({
        day: i,
        date: dataDia,
        eventsCount: count,
        hasEvents: count > 0,
      })
    }

    setDias(diasArray)
  }, [mes, eventCounts])

  const [ano, mesNum] = mes.split('-').map(Number)
  const mesNome = new Date(Date.UTC(ano, mesNum - 1, 1)).toLocaleString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const handlePreviousMonth = () => {
    const data = new Date(Date.UTC(ano, mesNum - 2, 1))
    onMesChange(data.toISOString().slice(0, 7))
  }

  const hoje = new Date()
  const hojeKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

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
        {dias.map((dia, idx) => {
          const isHoje = dia.day > 0 && dia.date.toISOString().split('T')[0] === hojeKey
          return (
            <motion.button
              key={idx}
              onClick={() => dia.day > 0 && onDateSelect(dia.date, dia.eventsCount)}
              disabled={dia.day === 0}
              whileHover={dia.hasEvents ? { scale: 1.08, y: -2 } : dia.day > 0 ? { scale: 1.03 } : undefined}
              whileTap={dia.day > 0 ? { scale: 0.95 } : undefined}
              transition={{ type: 'spring', stiffness: 350, damping: 15 }}
              className={`
                aspect-square rounded-xl border-2 font-semibold transition-all
                flex flex-col items-center justify-center gap-1 text-sm relative overflow-hidden
                ${
                  dia.day === 0
                    ? 'bg-gray-50 dark:bg-gray-900 border-transparent cursor-default'
                    : isHoje
                      ? dia.hasEvents
                        ? 'bg-amber-50 dark:bg-amber-950/30 border-blue-500 dark:border-blue-400 text-amber-900 dark:text-amber-100 ring-2 ring-blue-500/20 shadow-md'
                        : 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-500 dark:border-blue-400 text-blue-905 dark:text-blue-100 ring-2 ring-blue-500/20 shadow-md'
                      : dia.hasEvents
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 hover:shadow-md'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:border-amber-300 dark:hover:border-amber-700'
                }
              `}
            >
              {dia.day > 0 && (
                <>
                  <span className={isHoje ? 'font-black text-blue-600 dark:text-blue-400' : ''}>{dia.day}</span>
                  {dia.hasEvents && (
                    <span className="text-xs font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full shadow-sm">
                      {dia.eventsCount}
                    </span>
                  )}
                  {isHoje && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 dark:bg-blue-400 rounded-full" />
                  )}
                </>
              )}
            </motion.button>
          )
        })}
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
