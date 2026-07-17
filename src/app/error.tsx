'use client'

import { useEffect } from 'react'
import { maybeReloadOnChunkError } from '@/lib/chunk-reload'

// Error boundary de segmento: pega erros das páginas (renderiza dentro do layout).
// Complementa o global-error.tsx — juntos, nenhum crash vira mais tela preta muda.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    maybeReloadOnChunkError(error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 380 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>
          Algo deu errado ao abrir esta tela
        </h1>
        <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.5, margin: '0 0 20px' }}>
          Pode ser uma atualização recente do sistema. Toque em recarregar.
        </p>
        <button
          onClick={() => {
            try {
              reset()
            } catch {
              /* ignore */
            }
            window.location.reload()
          }}
          style={{
            background: '#dc2626',
            color: '#fff',
            border: 0,
            borderRadius: 10,
            padding: '10px 18px',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Recarregar
        </button>
      </div>
    </div>
  )
}
