'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  ClipboardList, Plus, Eye, Pencil, Trash2, Printer,
  CheckCircle2, XCircle, AlertTriangle, Clock, Users,
  Search, X, Check, Loader2, ChevronRight, Shield,
  FileText, Calendar, MapPin, User, AlertCircle, Map,
} from 'lucide-react'

const MiniMapPicker = dynamic(() => import('./MiniMapPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-[348px] rounded-xl border border-gray-200 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
    </div>
  ),
})

// ─── Types ───────────────────────────────────────────────────────────────────

interface Participante {
  id: string
  userId: string
  user: { id: string; name: string; role: string; avatar?: string | null }
  cienciaEm?: string | null
  cienciaIp?: string | null
  createdAt: string
}

interface OrdemMissao {
  id: string
  numero: string
  titulo: string
  historico?: string | null
  ipNumero?: string | null
  naturezaFato?: string | null
  dataFato?: string | null
  horaFato?: string | null
  localFato?: string | null
  vitima?: string | null
  naturezaInvestigacao?: string | null
  observacoes?: string | null
  prazo: string
  status: 'ATIVA' | 'CONCLUIDA' | 'VENCIDA' | 'CANCELADA'
  emitidoPorId: string
  emitidoPor: { id: string; name: string; role: string; avatar?: string | null }
  participantes: Participante[]
  createdAt: string
  updatedAt: string
}

interface UserOption {
  id: string
  name: string
  role: string
  avatar?: string | null
}

interface OrdemMissaoPanelProps {
  userRole: string
  currentUserId: string
  currentUserName: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  ATIVA: {
    label: 'Ativa',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  CONCLUIDA: {
    label: 'Concluída',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    icon: CheckCircle2,
  },
  VENCIDA: {
    label: 'Vencida',
    color: 'bg-red-100 text-red-700 border-red-200',
    dot: 'bg-red-500',
    icon: AlertTriangle,
  },
  CANCELADA: {
    label: 'Cancelada',
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    dot: 'bg-gray-400',
    icon: XCircle,
  },
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
}

function prazoColor(prazo: string, status: string) {
  if (status !== 'ATIVA') return 'text-gray-500'
  const diff = new Date(prazo).getTime() - Date.now()
  const days = diff / 86400000
  if (days < 0) return 'text-red-600 font-semibold'
  if (days < 3) return 'text-orange-500 font-semibold'
  if (days < 7) return 'text-yellow-600'
  return 'text-gray-600'
}

function prazoLabel(prazo: string, status: string) {
  const diff = new Date(prazo).getTime() - Date.now()
  const days = Math.ceil(diff / 86400000)
  if (status === 'CONCLUIDA') return 'Concluída'
  if (status === 'CANCELADA') return 'Cancelada'
  if (days < 0) return `Venceu há ${Math.abs(days)} dia(s)`
  if (days === 0) return 'Vence hoje'
  if (days === 1) return 'Vence amanhã'
  return `${days} dia(s) restante(s)`
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDateOnly(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

const LEGAL_TEXT = `"O teor sigiloso deste documento é protegido e controlado pela Lei nº 12.527, de 18.11.2011, que restringe o acesso, a divulgação e o tratamento deste documento a pessoa devidamente credenciadas que tenham necessidade de conhecê-lo."`

// ─── Document Print HTML builder ─────────────────────────────────────────────

function buildPrintHtml(contentHtml: string, titulo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${titulo}</title>
<style>
  @page { size: A4 portrait; margin: 1.8cm 2cm 1.8cm 2cm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #000; background: white; padding: 0; margin: 0; }
  img { max-width: 100%; }
  p { margin: 0 0 3px; orphans: 3; widows: 3; }
  hr { border: none; border-top: 1.5px solid #000; margin: 8px 0 10px; }
  .doc-footer { margin-top: 30px; padding: 5px 0 0; border-top: 1px solid #ccc; break-inside: avoid; }
  .doc-footer p { font-size: 7.5pt; color: #333; text-align: justify; line-height: 1.3; margin: 0; }
</style>
</head>
<body>
${contentHtml}
<div class="doc-footer"><p>${LEGAL_TEXT}</p></div>
<script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}<\/script>
</body>
</html>`
}

// ─── Document Preview Component ───────────────────────────────────────────────

function DocumentPreview({
  ordem,
  badgeSizes,
  badgeTs,
  printRef,
}: {
  ordem: OrdemMissao
  badgeSizes: { sejus: number; aip: number; policiaPenal: number }
  badgeTs: number
  printRef: React.RefObject<HTMLDivElement>
}) {
  const badgeUrl = (key: string) => `/logos/${key}.png?t=${badgeTs}`
  const para: React.CSSProperties = {
    textAlign: 'justify', fontSize: '11pt', lineHeight: '1.6',
    marginBottom: '10px', whiteSpace: 'pre-wrap',
  }
  const field: React.CSSProperties = { fontSize: '11pt', marginBottom: '4px' }

  return (
    <div
      ref={printRef}
      className="bg-white text-black"
      style={{
        fontFamily: 'Arial, sans-serif', fontSize: '11pt', lineHeight: '1.5',
        padding: '0.8cm 2cm 1.5cm', minHeight: '27cm', width: '100%',
      }}
    >
      {/* Cabeçalho institucional 3 colunas */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' }}>
        <div style={{ width: badgeSizes.sejus + 8, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <img src={badgeUrl('badge-sejus')} alt="SEJUS" style={{ width: badgeSizes.sejus, height: 'auto' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
        <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <p style={{ fontWeight: 'bold', fontSize: '10pt', margin: '0 0 2px', textTransform: 'uppercase' }}>SECRETARIA DE ESTADO DA JUSTIÇA DE RONDÔNIA</p>
          <p style={{ fontWeight: 'bold', fontSize: '10pt', margin: '0 0 2px', textTransform: 'uppercase' }}>AGÊNCIA DE INTELIGÊNCIA PENAL</p>
          <p style={{ fontWeight: 'bold', fontSize: '10pt', margin: '0 0 2px', textTransform: 'uppercase' }}>POLÍCIA PENAL DE RONDÔNIA</p>
          <p style={{ fontWeight: 'bold', fontSize: '12pt', margin: '2px 0 8px', textTransform: 'uppercase' }}>AIP/SEJUS/RO</p>
          <img src={badgeUrl('badge-aip')} alt="AIP/SEJUS/RO" style={{ width: badgeSizes.aip, height: 'auto' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
        <div style={{ width: badgeSizes.policiaPenal + 8, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <img src={badgeUrl('badge-policia-penal')} alt="Polícia Penal RO" style={{ width: badgeSizes.policiaPenal, height: 'auto' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
      </div>

      <hr style={{ margin: '8px 0 12px', borderTop: '2px solid #000', borderBottom: 'none' }} />

      {/* Título principal */}
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <p style={{ fontWeight: 'bold', fontSize: '14pt', textTransform: 'uppercase', margin: '0 0 4px', letterSpacing: '0.04em' }}>
          {ordem.numero}
        </p>
      </div>

      <hr style={{ margin: '0 0 14px', borderTop: '1px solid #555', borderBottom: 'none' }} />

      {/* Histórico da Ocorrência */}
      {(ordem.ipNumero || ordem.naturezaFato || ordem.dataFato || ordem.localFato || ordem.vitima) && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontWeight: 'bold', fontSize: '12pt', textTransform: 'uppercase', textDecoration: 'underline', textAlign: 'center', margin: '0 0 10px' }}>
              Histórico da Ocorrência
            </p>
            {ordem.ipNumero && (
              <p style={field}><strong>Documentos Vinculados:</strong> {ordem.ipNumero}</p>
            )}
            {ordem.naturezaFato && (
              <p style={field}><strong>Natureza do fato:</strong> {ordem.naturezaFato}</p>
            )}
            {ordem.dataFato && (
              <p style={field}>
                <strong>Data:</strong> {formatDateOnly(ordem.dataFato)}
                {ordem.horaFato && <>&nbsp;&nbsp;&nbsp;<strong>às</strong> {ordem.horaFato}</>}
              </p>
            )}
            {ordem.localFato && (
              <p style={field}><strong>Local:</strong> {ordem.localFato}</p>
            )}
            {ordem.vitima && (
              <p style={field}><strong>Objetivo:</strong> <strong style={{ textTransform: 'uppercase' }}>{ordem.vitima}</strong></p>
            )}
          </div>
          <hr style={{ margin: '0 0 14px', borderTop: '1px solid #555', borderBottom: 'none' }} />
        </>
      )}

      {/* Natureza da Missão */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontWeight: 'bold', fontSize: '12pt', textTransform: 'uppercase', textDecoration: 'underline', textAlign: 'center', margin: '0 0 14px' }}>
          Natureza da Missão
        </p>
        <p style={{ ...para, textIndent: '1.5cm' }}>
          {ordem.naturezaInvestigacao || 'Deverá a equipe de investigadores, a que esta for distribuída, diligenciar no sentido de verificar a procedência da determinação.'}
        </p>
        {ordem.observacoes && (
          <p style={{ ...para, textIndent: '1.5cm', marginTop: '8px' }}>
            {ordem.observacoes}
          </p>
        )}
      </div>

      {/* Prazo */}
      <div style={{ marginBottom: '20px' }}>
        <p style={field}><strong>Prazo para cumprimento:</strong> {formatDateTime(ordem.prazo)}</p>
      </div>

      <hr style={{ margin: '0 0 20px', borderTop: '1px solid #555', borderBottom: 'none' }} />

      {/* Fechamento */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <p style={{ fontSize: '11pt', marginBottom: '30px' }}>Cumpra-se</p>
        <p style={{ fontSize: '11pt', marginBottom: '2px' }}>
          <strong>{ordem.emitidoPor.name}</strong>
        </p>
        <p style={{ fontSize: '10pt' }}>{ROLE_LABEL[ordem.emitidoPor.role] || ordem.emitidoPor.role}</p>
        <p style={{ fontSize: '10pt' }}>Agência de Inteligência Penal — AIP/SEJUS/RO</p>
      </div>

      <p style={{ fontSize: '10pt', textAlign: 'justify' }}>
        Dada e lavrada nos autos da Agência de Inteligência Penal, em{' '}
        {new Date(ordem.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.
      </p>
    </div>
  )
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrdemCard({
  ordem,
  currentUserId,
  onView,
  onEdit,
  onDelete,
  canEdit,
}: {
  ordem: OrdemMissao
  currentUserId: string
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  canEdit: boolean
}) {
  const cfg = STATUS_CONFIG[ordem.status]
  const Icon = cfg.icon
  const total = ordem.participantes.length
  const comCiencia = ordem.participantes.filter(p => p.cienciaEm).length
  const myParticipacao = ordem.participantes.find(p => p.userId === currentUserId)
  const pendingMyCiencia = myParticipacao && !myParticipacao.cienciaEm

  return (
    <div
      className={`group relative bg-white dark:bg-gray-800 border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer ${
        pendingMyCiencia ? 'border-amber-400 shadow-amber-100 dark:shadow-none' : 'border-gray-200 dark:border-gray-700'
      }`}
      onClick={onView}
    >
      {pendingMyCiencia && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-50 border border-amber-300 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
          <AlertCircle className="w-3 h-3" />
          Sua ciência pendente
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg shrink-0 mt-0.5">
          <ClipboardList className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{ordem.numero}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          </div>
          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate mb-2">{ordem.titulo}</p>

          <div className="flex items-center gap-4 flex-wrap text-xs">
            <span className={`flex items-center gap-1 ${prazoColor(ordem.prazo, ordem.status)}`}>
              <Clock className="w-3 h-3" />
              {prazoLabel(ordem.prazo, ordem.status)}
            </span>
            {total > 0 && (
              <span className="flex items-center gap-1 text-gray-500">
                <Users className="w-3 h-3" />
                {comCiencia}/{total} ciências
              </span>
            )}
            <span className="text-gray-400">
              por {ordem.emitidoPor.name.split(' ')[0]}
            </span>
          </div>

          {/* Participantes mini avatars */}
          {total > 0 && (
            <div className="flex items-center gap-1 mt-2">
              {ordem.participantes.slice(0, 8).map(p => (
                <div
                  key={p.id}
                  title={`${p.user.name}${p.cienciaEm ? ' ✓ ciência dada' : ' — pendente'}`}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                    p.cienciaEm
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                      : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                  }`}
                >
                  {p.user.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {total > 8 && (
                <span className="text-xs text-gray-400 ml-1">+{total - 8}</span>
              )}
            </div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 mt-1 group-hover:text-purple-400 transition-colors" />
      </div>

      {canEdit && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}>
          <button onClick={onEdit}
            className="p-1.5 rounded-lg bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600 dark:bg-gray-700 dark:hover:bg-blue-900/40 transition-colors"
            title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 dark:bg-gray-700 dark:hover:bg-red-900/40 transition-colors"
            title="Excluir">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Editor Modal ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  numero: '', titulo: '', historico: '', ipNumero: '',
  naturezaFato: '', dataFato: '', horaFato: '', localFato: '',
  vitima: '', naturezaInvestigacao: '', observacoes: '',
  prazo: '', participanteIds: [] as string[],
}

function EditorModal({
  ordem,
  defaultNumero = '',
  users,
  badgeSizes,
  badgeTs,
  onSave,
  onClose,
}: {
  ordem: OrdemMissao | null
  defaultNumero?: string
  users: UserOption[]
  badgeSizes: { sejus: number; aip: number; policiaPenal: number }
  badgeTs: number
  onSave: (data: typeof EMPTY_FORM) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState(() => {
    if (!ordem) return { ...EMPTY_FORM, numero: defaultNumero }
    return {
      numero: ordem.numero,
      titulo: ordem.titulo,
      historico: ordem.historico || '',
      ipNumero: ordem.ipNumero || '',
      naturezaFato: ordem.naturezaFato || '',
      dataFato: ordem.dataFato ? ordem.dataFato.split('T')[0] : '',
      horaFato: ordem.horaFato || '',
      localFato: ordem.localFato || '',
      vitima: ordem.vitima || '',
      naturezaInvestigacao: ordem.naturezaInvestigacao || '',
      observacoes: ordem.observacoes || '',
      prazo: ordem.prazo ? ordem.prazo.slice(0, 16) : '',
      participanteIds: (ordem.participantes ?? []).map(p => p.userId),
    }
  })
  const [saving, setSaving] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const previewOrdem: OrdemMissao = {
    ...((ordem as any) || {}),
    ...form,
    dataFato: form.dataFato || null,
    prazo: form.prazo || new Date().toISOString(),
    emitidoPor: (ordem?.emitidoPor) || { id: '', name: '—', role: 'OPERATOR' },
    participantes: [],
    createdAt: (ordem?.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: (ordem?.status) || 'ATIVA',
    id: ordem?.id || '',
  }

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    ROLE_LABEL[u.role]?.toLowerCase().includes(userSearch.toLowerCase())
  )

  const toggleUser = (uid: string) => {
    setForm(f => ({
      ...f,
      participanteIds: f.participanteIds.includes(uid)
        ? f.participanteIds.filter(id => id !== uid)
        : [...f.participanteIds, uid],
    }))
  }

  const handleSubmit = async () => {
    if (!form.numero.trim() || !form.titulo.trim() || !form.prazo) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  const label = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1'
  const input = 'w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500'
  const textarea = input + ' resize-none'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex">
      {/* Left: Form */}
      <div className="w-full lg:w-[44%] bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
              <ClipboardList className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">
                {ordem ? 'Editar Ordem de Missão' : 'Nova Ordem de Missão'}
              </h2>
              <p className="text-xs text-gray-500">Preencha os dados da missão</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Identificação */}
          <section>
            <h3 className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Identificação
            </h3>
            <div className="space-y-3">
              <div>
                <label className={label}>Número da Ordem *</label>
                <input className={input} value={form.numero}
                  onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                  placeholder="OM nº 001/2025/AIP/SEJUS/RO" />
              </div>
              <div>
                <label className={label}>Título / Objeto *</label>
                <input className={input} value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Descrição resumida da missão" />
              </div>
              <div>
                <label className={label}>Prazo para Cumprimento *</label>
                <input type="datetime-local" className={input} value={form.prazo}
                  onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
              </div>
            </div>
          </section>

          {/* Histórico */}
          <section>
            <h3 className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Histórico da Ocorrência
            </h3>
            <div className="space-y-3">
              <div>
                <label className={label}>Documentos Vinculados</label>
                <input className={input} value={form.ipNumero}
                  onChange={e => setForm(f => ({ ...f, ipNumero: e.target.value }))}
                  placeholder="IP nº 83/2011, Processo SEI..." />
              </div>
              <div>
                <label className={label}>Natureza do Fato</label>
                <input className={input} value={form.naturezaFato}
                  onChange={e => setForm(f => ({ ...f, naturezaFato: e.target.value }))}
                  placeholder="Coleta de Dados, Cumprimento de Mandado, etc." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Data do Fato</label>
                  <input type="date" className={input} value={form.dataFato}
                    onChange={e => setForm(f => ({ ...f, dataFato: e.target.value }))} />
                </div>
                <div>
                  <label className={label}>Hora</label>
                  <input className={input} value={form.horaFato}
                    onChange={e => setForm(f => ({ ...f, horaFato: e.target.value }))}
                    placeholder="03h da madrugada" />
                </div>
              </div>
              <div>
                <label className={label}>Local</label>
                <input className={input} value={form.localFato}
                  onChange={e => setForm(f => ({ ...f, localFato: e.target.value }))}
                  placeholder="Av. Principal, próx. ao Hotel..." />
                <button
                  type="button"
                  onClick={() => setMapOpen(v => !v)}
                  className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                    mapOpen
                      ? 'bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/30 dark:border-purple-600 dark:text-purple-300'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-purple-600 hover:border-purple-300 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400'
                  }`}
                >
                  <Map className="w-3.5 h-3.5" />
                  {mapOpen ? 'Fechar mapa' : 'Localizar no mapa'}
                </button>
                {mapOpen && (
                  <div className="mt-2">
                    <MiniMapPicker
                      onSelect={address => {
                        setForm(f => ({ ...f, localFato: address }))
                        setMapOpen(false)
                      }}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className={label}>Objetivo</label>
                <input className={input} value={form.vitima}
                  onChange={e => setForm(f => ({ ...f, vitima: e.target.value }))}
                  placeholder="Descreva o objetivo da missão" />
              </div>
            </div>
          </section>

          {/* Natureza da investigação */}
          <section>
            <h3 className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Natureza da Missão
            </h3>
            <div className="space-y-3">
              <div>
                <label className={label}>Instrução / Determinação *</label>
                <textarea className={textarea} rows={5} value={form.naturezaInvestigacao}
                  onChange={e => setForm(f => ({ ...f, naturezaInvestigacao: e.target.value }))}
                  placeholder="Deverá a equipe de inteligência encarregada da missão empregar os meios e técnicas legalmente disponíveis para a obtenção e produção de conhecimentos relacionados ao objeto da demanda, observando os princípios da necessidade, oportunidade, compartimentação e proteção do conhecimento." />
              </div>
              <div>
                <label className={label}>Observações Complementares</label>
                <textarea className={textarea} rows={3} value={form.observacoes}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Informações adicionais..." />
              </div>
            </div>
          </section>

          {/* Participantes */}
          <section>
            <h3 className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Equipe de Execução
            </h3>
            <div>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input className={input + ' pl-8'} value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Buscar agente..." />
              </div>
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {filteredUsers.map(u => {
                  const selected = form.participanteIds.includes(u.id)
                  return (
                    <button key={u.id} type="button"
                      onClick={() => toggleUser(u.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors ${
                        selected ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-white dark:bg-gray-800'
                      }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        selected ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {selected ? <Check className="w-4 h-4" /> : u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.name}</p>
                        <p className="text-xs text-gray-500">{ROLE_LABEL[u.role] || u.role}</p>
                      </div>
                      {selected && <Check className="w-4 h-4 text-purple-600 shrink-0" />}
                    </button>
                  )
                })}
                {filteredUsers.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-4">Nenhum agente encontrado</p>
                )}
              </div>
              {form.participanteIds.length > 0 && (
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1.5 font-medium">
                  {form.participanteIds.length} agente(s) selecionado(s)
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !form.numero || !form.titulo || !form.prazo}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Emitir Ordem'}
          </button>
        </div>
      </div>

      {/* Right: Live preview */}
      <div className="hidden lg:flex flex-col flex-1 bg-gray-200 dark:bg-gray-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-100 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700">
          <span className="text-xs font-medium text-gray-500">Pré-visualização — A4</span>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white shadow-xl rounded-lg overflow-hidden mx-auto" style={{ maxWidth: '21cm' }}>
            <DocumentPreview ordem={previewOrdem} badgeSizes={badgeSizes} badgeTs={badgeTs} printRef={printRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Viewer Modal ─────────────────────────────────────────────────────────────

function ViewerModal({
  ordem,
  currentUserId,
  canEdit,
  badgeSizes,
  badgeTs,
  onEdit,
  onClose,
  onStatusChange,
  onCiencia,
}: {
  ordem: OrdemMissao
  currentUserId: string
  canEdit: boolean
  badgeSizes: { sejus: number; aip: number; policiaPenal: number }
  badgeTs: number
  onEdit: () => void
  onClose: () => void
  onStatusChange: (status: OrdemMissao['status']) => Promise<void>
  onCiencia: () => Promise<void>
}) {
  const printRef = useRef<HTMLDivElement>(null)
  const [confirmCiencia, setConfirmCiencia] = useState(false)
  const [givingCiencia, setGivingCiencia] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  const myParticipacao = ordem.participantes.find(p => p.userId === currentUserId)
  const total = ordem.participantes.length
  const comCiencia = ordem.participantes.filter(p => p.cienciaEm).length

  const handlePrint = async () => {
    const html = printRef.current?.innerHTML
    if (!html) return

    const toDataUri = async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url)
        if (!res.ok) return null
        const blob = await res.blob()
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      } catch { return null }
    }

    let printHtml = html
    const badgeKeys = ['badge-sejus', 'badge-aip', 'badge-policia-penal']
    for (const key of badgeKeys) {
      const dataUri = await toDataUri(`/logos/${key}.png?t=${badgeTs}`)
      if (dataUri) {
        printHtml = printHtml.replace(
          new RegExp(`src="/logos/${key}\\.png[^"]*"`, 'g'),
          `src="${dataUri}"`
        )
      }
    }

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) { alert('Permita pop-ups para imprimir.'); return }
    win.document.write(buildPrintHtml(printHtml, ordem.numero))
    win.document.close()
  }

  const handleCiencia = async () => {
    setGivingCiencia(true)
    try {
      await onCiencia()
      setConfirmCiencia(false)
    } finally {
      setGivingCiencia(false)
    }
  }

  const handleStatus = async (st: OrdemMissao['status']) => {
    setChangingStatus(true)
    try { await onStatusChange(st) } finally { setChangingStatus(false) }
  }

  const cfg = STATUS_CONFIG[ordem.status]

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
            <ClipboardList className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-white text-sm">{ordem.numero}</p>
            <p className="text-xs text-gray-500 truncate max-w-xs">{ordem.titulo}</p>
          </div>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {myParticipacao && !myParticipacao.cienciaEm && (
            <button onClick={() => setConfirmCiencia(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg transition-colors animate-pulse">
              <Check className="w-4 h-4" />
              DAR CIÊNCIA
            </button>
          )}
          {canEdit && ordem.status === 'ATIVA' && (
            <>
              <button onClick={() => handleStatus('CONCLUIDA')} disabled={changingStatus}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Concluir
              </button>
              <button onClick={() => handleStatus('CANCELADA')} disabled={changingStatus}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 border border-gray-200 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                <XCircle className="w-3.5 h-3.5" />
                Cancelar
              </button>
              <button onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 rounded-lg transition-colors">
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </button>
            </>
          )}
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 rounded-lg transition-colors">
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
          <button onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-200 dark:bg-gray-950 p-6 space-y-6">
        {/* Document */}
        <div className="bg-white shadow-xl rounded-lg overflow-hidden mx-auto" style={{ maxWidth: '21cm' }}>
          <DocumentPreview ordem={ordem} badgeSizes={badgeSizes} badgeTs={badgeTs} printRef={printRef} />
        </div>

        {/* Ciência section */}
        {total > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mx-auto" style={{ maxWidth: '21cm' }}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-gray-900 dark:text-white text-sm uppercase tracking-wider">
                  Controle de Ciência
                </h3>
              </div>
              <span className="text-sm font-medium text-gray-500">
                {comCiencia} / {total} confirmado(s)
              </span>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {ordem.participantes.map((p, idx) => (
                <div key={p.id} className={`flex items-center gap-4 px-6 py-3 ${
                  p.cienciaEm ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''
                }`}>
                  <span className="text-xs text-gray-400 w-5 text-center font-mono">{idx + 1}</span>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    p.cienciaEm
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {p.cienciaEm ? <Check className="w-4 h-4" /> : p.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.user.name}</p>
                    <p className="text-xs text-gray-500">{ROLE_LABEL[p.user.role] || p.user.role}</p>
                  </div>
                  <div className="text-right">
                    {p.cienciaEm ? (
                      <div>
                        <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 justify-end">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Ciência dada
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(p.cienciaEm)}</p>
                        {p.cienciaIp && <p className="text-xs text-gray-300 dark:text-gray-600">IP: {p.cienciaIp}</p>}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Pendente</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm Ciência dialog */}
      {confirmCiencia && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                <Check className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Confirmar Ciência</h3>
                <p className="text-xs text-gray-500">{ordem.numero}</p>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-5">
              <p className="text-sm text-amber-800 dark:text-amber-300 text-center font-medium leading-relaxed">
                Declaro que li e tomei plena ciência da presente Ordem de Missão, comprometendo-me a cumpri-la dentro do prazo estipulado.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmCiencia(false)}
                disabled={givingCiencia}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 dark:border-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button onClick={handleCiencia}
                disabled={givingCiencia}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors flex items-center justify-center gap-2">
                {givingCiencia ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {givingCiencia ? 'Registrando...' : 'Confirmar Ciência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function OrdemMissaoPanel({ userRole, currentUserId, currentUserName }: OrdemMissaoPanelProps) {
  const [ordens, setOrdens] = useState<OrdemMissao[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('TODAS')
  const [users, setUsers] = useState<UserOption[]>([])
  const [badgeSizes, setBadgeSizes] = useState({ sejus: 72, aip: 80, policiaPenal: 72 })
  const [badgeTs] = useState(() => Date.now())

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingOrdem, setEditingOrdem] = useState<OrdemMissao | null>(null)
  const [viewerOrdem, setViewerOrdem] = useState<OrdemMissao | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canEdit = ['SUPER_ADMIN', 'ADMIN'].includes(userRole)

  const fetchOrdens = useCallback(async () => {
    try {
      const res = await fetch('/api/aip/ordens-missao')
      if (res.ok) {
        const data = await res.json()
        setOrdens(data.ordens || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrdens()
    fetch('/api/relint-config')
      .then(r => r.json())
      .then(d => setBadgeSizes(prev => ({ ...prev, ...d })))
      .catch(() => {})
  }, [fetchOrdens])

  useEffect(() => {
    if (editorOpen) {
      fetch('/api/users')
        .then(r => r.json())
        .then(d => setUsers(Array.isArray(d) ? d : (d.users || [])))
        .catch(() => {})
    }
  }, [editorOpen])

  const [nextNumero, setNextNumero] = useState('')

  const openNew = async () => {
    const res = await fetch('/api/aip/ordens-missao/proximo-numero')
    const data = res.ok ? await res.json() : { numero: '' }
    setNextNumero(data.numero)
    setEditingOrdem(null)
    setEditorOpen(true)
  }

  const openEdit = (ordem: OrdemMissao) => {
    setEditingOrdem(ordem)
    setEditorOpen(true)
  }

  const openView = (ordem: OrdemMissao) => setViewerOrdem(ordem)

  const handleSave = async (formData: typeof EMPTY_FORM) => {
    const url = editingOrdem
      ? `/api/aip/ordens-missao/${editingOrdem.id}`
      : '/api/aip/ordens-missao'
    const method = editingOrdem ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })

    if (res.ok) {
      setEditorOpen(false)
      setEditingOrdem(null)
      await fetchOrdens()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao salvar ordem de missão')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirmId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/aip/ordens-missao/${deleteConfirmId}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteConfirmId(null)
        setOrdens(prev => prev.filter(o => o.id !== deleteConfirmId))
      }
    } finally {
      setDeleting(false)
    }
  }

  const handleStatusChange = async (status: OrdemMissao['status']) => {
    if (!viewerOrdem) return
    const res = await fetch(`/api/aip/ordens-missao/${viewerOrdem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const data = await res.json()
      setViewerOrdem(data.ordem)
      setOrdens(prev => prev.map(o => o.id === data.ordem.id ? data.ordem : o))
    }
  }

  const handleCiencia = async () => {
    if (!viewerOrdem) return
    const res = await fetch(`/api/aip/ordens-missao/${viewerOrdem.id}/ciencia`, { method: 'POST' })
    if (res.ok) {
      // Refresh the order
      const ordRes = await fetch(`/api/aip/ordens-missao/${viewerOrdem.id}`)
      if (ordRes.ok) {
        const data = await ordRes.json()
        setViewerOrdem(data.ordem)
        setOrdens(prev => prev.map(o => o.id === data.ordem.id ? data.ordem : o))
      }
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao registrar ciência')
    }
  }

  // Stats
  const stats = {
    total: ordens.length,
    ativas: ordens.filter(o => o.status === 'ATIVA').length,
    vencidas: ordens.filter(o => o.status === 'VENCIDA').length,
    pendenteCiencia: ordens.filter(o =>
      o.participantes.some(p => p.userId === currentUserId && !p.cienciaEm)
    ).length,
  }

  const filtered = ordens.filter(o => {
    const matchStatus = statusFilter === 'TODAS' || o.status === statusFilter
    const matchSearch = !search ||
      o.titulo.toLowerCase().includes(search.toLowerCase()) ||
      o.numero.toLowerCase().includes(search.toLowerCase()) ||
      o.vitima?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        {[
          { label: 'Total de Ordens', value: stats.total, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-100 dark:border-purple-800' },
          { label: 'Ativas', value: stats.ativas, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-100 dark:border-emerald-800' },
          { label: 'Vencidas', value: stats.vencidas, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-100 dark:border-red-800' },
          { label: 'Minha Ciência Pendente', value: stats.pendenteCiencia, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-100 dark:border-amber-800' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg} ${s.border}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Buscar por título, número, vítima..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          {(['TODAS', 'ATIVA', 'CONCLUIDA', 'VENCIDA', 'CANCELADA'] as const).map(s => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                statusFilter === s
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              {s === 'TODAS' ? 'Todas' : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>

        {canEdit && (
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-colors shrink-0">
            <Plus className="w-4 h-4" />
            Nova Ordem
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
            <ClipboardList className="w-10 h-10" />
            <p className="text-sm font-medium">
              {search || statusFilter !== 'TODAS'
                ? 'Nenhuma ordem encontrada com os filtros aplicados'
                : 'Nenhuma ordem de missão emitida ainda'}
            </p>
            {canEdit && !search && statusFilter === 'TODAS' && (
              <button onClick={openNew}
                className="text-xs text-purple-600 hover:underline font-medium">
                Emitir a primeira ordem de missão
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map(ordem => (
              <OrdemCard
                key={ordem.id}
                ordem={ordem}
                currentUserId={currentUserId}
                onView={() => openView(ordem)}
                onEdit={() => openEdit(ordem)}
                onDelete={() => setDeleteConfirmId(ordem.id)}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {editorOpen && (
        <EditorModal
          key={editingOrdem?.id ?? `new-${nextNumero}`}
          ordem={editingOrdem ?? null}
          defaultNumero={nextNumero}
          users={users}
          badgeSizes={badgeSizes}
          badgeTs={badgeTs}
          onSave={handleSave}
          onClose={() => { setEditorOpen(false); setEditingOrdem(null) }}
        />
      )}

      {/* Viewer Modal */}
      {viewerOrdem && (
        <ViewerModal
          ordem={viewerOrdem}
          currentUserId={currentUserId}
          canEdit={canEdit}
          badgeSizes={badgeSizes}
          badgeTs={badgeTs}
          onEdit={() => { setViewerOrdem(null); openEdit(viewerOrdem) }}
          onClose={() => setViewerOrdem(null)}
          onStatusChange={handleStatusChange}
          onCiencia={handleCiencia}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-red-100 dark:bg-red-900/30 rounded-full">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white">Excluir Ordem de Missão</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
              Esta ação é irreversível. Todos os dados desta ordem, incluindo registros de ciência, serão excluídos permanentemente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors flex items-center justify-center gap-2">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
