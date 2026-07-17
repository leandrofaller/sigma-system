'use client'

import { useEffect } from 'react'
import { maybeReloadOnChunkError } from '@/lib/chunk-reload'

// Error boundary de nível raiz: pega até erros do layout. Como substitui o layout,
// não tem acesso ao globals.css — por isso os estilos são inline. Fundo escuro igual
// ao themeColor dark para não piscar branco no WebView.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Causa nº1 no app mobile: chunk antigo após redeploy. Recarrega uma vez.
    maybeReloadOnChunkError(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          background: '#0f1115',
          color: '#e5e7eb',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 380 }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>
              Não foi possível carregar
            </h1>
            <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.5, margin: '0 0 20px' }}>
              O aplicativo pode estar sendo atualizado. Toque em recarregar — costuma resolver em
              segundos.
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
                padding: '12px 22px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Recarregar
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
