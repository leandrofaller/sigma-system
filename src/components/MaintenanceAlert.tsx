'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react'

interface MaintenanceData {
  id: string
  title: string
  message: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  graceTimeUntil: string | null
  createdAt: string
}

export function MaintenanceAlert() {
  const [maintenance, setMaintenance] = useState<MaintenanceData | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Fetch aviso de manutenção
  useEffect(() => {
    const fetchMaintenance = async () => {
      try {
        const res = await fetch('/api/system/maintenance')
        const data = await res.json()
        if (data.maintenance) {
          setMaintenance(data.maintenance)
          setDismissed(false) // Reset dismissal quando carrega novo aviso
        }
      } catch (err) {
        console.error('[MaintenanceAlert] Fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMaintenance()
    // Recheck a cada 30 segundos
    const interval = setInterval(fetchMaintenance, 30000)
    return () => clearInterval(interval)
  }, [])

  // Countdown timer
  useEffect(() => {
    if (!maintenance?.graceTimeUntil) return

    const updateCountdown = () => {
      const now = new Date().getTime()
      const graceTime = new Date(maintenance.graceTimeUntil!).getTime()
      const diff = graceTime - now

      if (diff <= 0) {
        // Quando o prazo passa, desaparece o aviso automaticamente
        setMaintenance(null)
        setTimeRemaining('')
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [maintenance])

  if (loading || !maintenance || dismissed) {
    return null
  }

  const severityConfig = {
    INFO: {
      bg: 'bg-blue-50 border-blue-200',
      icon: Info,
      text: 'text-blue-800',
      title: 'text-blue-900',
      button: 'hover:bg-blue-100',
    },
    WARNING: {
      bg: 'bg-yellow-50 border-yellow-200',
      icon: AlertCircle,
      text: 'text-yellow-800',
      title: 'text-yellow-900',
      button: 'hover:bg-yellow-100',
    },
    CRITICAL: {
      bg: 'bg-red-50 border-red-200',
      icon: AlertTriangle,
      text: 'text-red-800',
      title: 'text-red-900',
      button: 'hover:bg-red-100',
    },
  }

  const config = severityConfig[maintenance.severity]
  const IconComponent = config.icon

  return (
    <div className={`w-full border-b-2 ${config.bg} animate-pulse`}>
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-start gap-4">
          {/* Ícone */}
          <div className="flex-shrink-0 pt-1">
            <IconComponent className={`w-6 h-6 ${config.text}`} />
          </div>

          {/* Conteúdo */}
          <div className="flex-grow">
            <h3 className={`font-bold text-lg ${config.title} mb-1`}>
              {maintenance.title}
            </h3>
            <p className={`text-sm ${config.text} mb-2`}>
              {maintenance.message}
            </p>

            {/* Grace Time / Countdown */}
            {maintenance.graceTimeUntil && timeRemaining && (
              <div className={`text-sm font-semibold ${config.text} flex items-center gap-2`}>
                <span className="inline-block w-2 h-2 bg-current rounded-full animate-pulse" />
                Tempo até manutenção: <span className="font-mono">{timeRemaining}</span>
              </div>
            )}
          </div>

          {/* Botão de fechar */}
          <button
            onClick={() => setDismissed(true)}
            className={`flex-shrink-0 p-2 rounded ${config.button} transition-colors`}
            aria-label="Descartar aviso"
          >
            <X className={`w-5 h-5 ${config.text}`} />
          </button>
        </div>
      </div>

      {/* Barra animada de aviso crítico */}
      {maintenance.severity === 'CRITICAL' && (
        <div className="h-1 bg-gradient-to-r from-red-400 via-red-500 to-red-400 animate-pulse" />
      )}
    </div>
  )
}
