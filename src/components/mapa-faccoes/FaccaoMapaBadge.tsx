'use client'

import type { FaccaoEstiloMapa } from '@/lib/mapa-faccoes'
import { PCC_STRIPE_GRADIENT } from '@/lib/mapa-faccoes-patterns'

export function PccStripeSwatch({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-sm border border-white/30 dark:border-white/20 shrink-0 ${className}`}
      style={{ background: PCC_STRIPE_GRADIENT }}
      aria-hidden
    />
  )
}

function isPccLabel(label: string, estiloMapa?: FaccaoEstiloMapa): boolean {
  if (estiloMapa?.predominanteGrupo === 'PCC') return true
  const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  return key.includes('PCC') || key.includes('PRIMEIRO COMANDO')
}

interface FaccaoMapaBadgeProps {
  label: string
  cor: string
  estiloMapa?: FaccaoEstiloMapa
  size?: 'xs' | 'sm'
  showStripeHint?: boolean
}

export function FaccaoMapaBadge({
  label,
  cor,
  estiloMapa,
  size = 'xs',
  showStripeHint,
}: FaccaoMapaBadgeProps) {
  const textSize = size === 'xs' ? 'text-xs' : 'text-sm'
  const isPcc = isPccLabel(label, estiloMapa)
  const stripeHint = showStripeHint ?? estiloMapa?.tipo === 'striped'

  if (isPcc) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 ${textSize} px-2.5 py-0.5 rounded-full font-bold bg-gray-950 text-white shadow-sm ring-1 ring-black/10 dark:ring-white/15`}
      >
        {stripeHint && <PccStripeSwatch />}
        {label}
      </span>
    )
  }

  return (
    <span
      className={`${textSize} px-2 py-0.5 rounded-full font-bold`}
      style={{ backgroundColor: `${cor}22`, color: cor }}
    >
      {label}
    </span>
  )
}