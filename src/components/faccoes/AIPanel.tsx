'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Brain, Users, Loader2, X, Edit2, Save, ChevronLeft, ChevronRight, Trash2, User, Shield, MapPin, Image, Briefcase, Settings, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

interface AIPFotoVisitante {
  id: string
  visitanteId: string | null
  nomeVisitante: string | null
  cpfVisitante: string | null
  parentescoVisitante: string | null
  ativoVisitante: boolean | null
  photoPath: string | null
  descricao: string | null
}

interface AIPApenado {
  id: string
  sipeId: number
  nome: string
  cpf?: string
  unidade?: string
  faccao?: string
  regime?: string
  situacao?: string

  // Novos campos do SIPE importados em AIP
  nomeOutro?: string | null
  rg?: string | null
  rgOrgao?: string | null
  dataNascimento?: string | null
  sexo?: string | null
  etnia?: string | null
  naturalidade?: string | null
  orientacaoSexual?: string | null
  tipoSanguineo?: string | null
  grauInstrucao?: string | null
  religiao?: string | null
  estadoCivil?: string | null
  nomeConjuge?: string | null
  qtdFilhos?: number | null
  nomeMae?: string | null
  nomePai?: string | null
  telefone?: string | null
  rji?: string | null

  // Dados Prisionais
  cela?: string | null
  dataEntrada?: string | null
  dataPrisao?: string | null
  tempoPena?: string | null
  monitorado?: boolean | null
  intramuro?: boolean | null
  presoOriundo?: string | null
  oficioEntrada?: string | null
  celeAtual?: string | null
  ultimaMovimentacao?: string | null

  // Endereço Residencial
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  cep?: string | null

  photoPath?: string | null

  // Inteligência
  facaoRealNome?: string
  facaoNivel?: string
  notasInteligencia?: string
  observacoes?: string
  vulgo?: string | null
  facaoRelevancia?: string | null

  cadastradoEm: string
  cadastradoPor: string
  atualizadoEm: string
  atualizadoPor?: string

  // Relacionamento com visitantes
  fotoVisitantes?: AIPFotoVisitante[]
  sipeApenado?: {
    vinculosAdvogado: Array<{
      advogado: {
        id: string
        nome: string
        oab: string | null
      }
    }>
  }
}

// ── Card de Apenado em AIP ──────────────────────────────

function AIApenadoCard({ apenado, onSelect }: { apenado: AIPApenado; onSelect: (a: AIPApenado) => void }) {
  const temInteligencia = !!(apenado.facaoRealNome || apenado.notasInteligencia)
  const isFaccaoConfirmada = apenado.facaoRealNome && apenado.facaoNivel === 'confirmado'

  return (
    <button
      type="button"
      onClick={() => onSelect(apenado)}
      className={`w-full text-left bg-white dark:bg-gray-800 rounded-xl border p-4 hover:shadow-md transition-all ${
        isFaccaoConfirmada 
          ? 'border-red-300 dark:border-red-900/60 hover:border-red-400 dark:hover:border-red-800 bg-red-50/10 dark:bg-red-950/10'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Foto de Perfil */}
        <div className={`w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-white text-lg relative ${
          isFaccaoConfirmada ? 'bg-red-500' : temInteligencia ? 'bg-purple-500' : 'bg-blue-500'
        }`}>
          {apenado.photoPath ? (
            <img
              src={`/api/aip/apenados/${apenado.id}/foto`}
              alt={apenado.nome}
              className="w-full h-full object-cover animate-fade-in"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span>{apenado.nome.charAt(0).toUpperCase()}</span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm">{apenado.nome}</h3>
          <p className="text-xs text-gray-500 mt-1 truncate">
            {apenado.unidade && `${apenado.unidade} • `}
            {apenado.faccao || '—'}
          </p>
          {apenado.facaoRealNome ? (
            <div className="mt-2 flex items-center">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                isFaccaoConfirmada
                  ? 'bg-red-500 text-white animate-pulse shadow-sm shadow-red-500/20'
                  : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
              }`}>
                <Shield className="w-2.5 h-2.5" />
                {apenado.facaoRealNome} {isFaccaoConfirmada ? '(Verificada)' : '(Suspeita)'}
              </span>
            </div>
          ) : temInteligencia && (
            <div className="mt-2 flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-xs text-purple-600 dark:text-purple-400">Dados de inteligência</span>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Modal de Detalhes do Apenado em AIP ──────────────────────────────

function AIApenadoModal({ apenado, layout, onClose, onUpdate, onDelete }: {
  apenado: AIPApenado
  layout?: any
  onClose: () => void
  onUpdate: (apenado: AIPApenado) => void
  onDelete?: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState(apenado)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  // Controle do Visualizador de Imagem (Zoom)
  const [zoomedPhotoUrl, setZoomedPhotoUrl] = useState<string | null>(null)
  const [zoomedPhotoTitle, setZoomedPhotoTitle] = useState<string>('')

  const isPhotoStyleFull = layout?.photoStyle === 'full'
  const isFaccaoConfirmada = apenado.facaoRealNome && apenado.facaoNivel === 'confirmado'

  const activeSections = layout?.sections || [
    { id: 'dados_pessoais', title: 'Dados Pessoais (SIPE)', visible: true },
    { id: 'situacao_prisional', title: 'Situação Prisional (SIPE)', visible: true },
    { id: 'endereco_residencial', title: 'Endereço Residencial (SIPE)', visible: true },
    { id: 'advogados', title: 'Advogados (SIPE)', visible: true },
    { id: 'dados_inteligencia', title: 'Dados de Inteligência', visible: true },
    { id: 'visitantes', title: 'Visitantes Cadastrados', visible: true }
  ]

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/aip/apenados/${apenado.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facaoRealNome: formData.facaoRealNome,
          facaoNivel: formData.facaoNivel,
          notasInteligencia: formData.notasInteligencia,
          observacoes: formData.observacoes,
          facaoRelevancia: formData.facaoRelevancia,
          vulgo: formData.vulgo,
          atualizadoPor: 'current-user' // TODO: integrar com auth real
        })
      })

      if (res.ok) {
        const { apenado: updated } = await res.json()
        setFormData(updated)
        onUpdate(updated)
        setEditing(false)
        toast.success('Inteligência atualizada com sucesso')
      } else {
        toast.error('Erro ao atualizar')
      }
    } catch (error) {
      console.error('Erro ao salvar:', error)
      toast.error('Erro ao salvar alterações')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      console.log(`[AIPanel] Iniciando deleção de: ${apenado.id}`)

      const url = `/api/aip/apenados/${apenado.id}?confirm=true`
      console.log(`[AIPanel] URL: ${url}`)

      const res = await fetch(url, {
        method: 'DELETE'
      })

      console.log(`[AIPanel] Status da resposta: ${res.status}`)

      const data = await res.json()
      console.log(`[AIPanel] Dados da resposta:`, data)

      if (res.ok) {
        console.log(`[AIPanel] Deleção bem-sucedida`)
        toast.success('Apenado deletado com sucesso')
        if (onDelete) {
          await onDelete(apenado.id)
        }
        onClose()
      } else {
        console.error(`[AIPanel] Erro na deleção: ${data.message}`)
        toast.error(data.message || 'Erro ao deletar')
      }
    } catch (error) {
      console.error('[AIPanel] Erro ao deletar:', error)
      toast.error('Erro ao deletar apenado')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4 items-center flex-1 min-w-0">
              {/* Foto grande/avatar condicional baseada no layout */}
              {!isPhotoStyleFull && (
                <div
                  onClick={() => {
                    if (apenado.photoPath) {
                      setZoomedPhotoUrl(`/api/aip/apenados/${apenado.id}/foto`);
                      setZoomedPhotoTitle(apenado.nome);
                    }
                  }}
                  className={`w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-400 to-purple-600 shadow-md flex items-center justify-center text-white font-bold text-3xl select-none ${
                    apenado.photoPath ? 'cursor-zoom-in hover:opacity-90 active:scale-95 transition-all' : ''
                  }`}
                >
                  {apenado.photoPath ? (
                    <img
                      src={`/api/aip/apenados/${apenado.id}/foto`}
                      alt={apenado.nome}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span>{apenado.nome.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate">{apenado.nome}</h2>
                {apenado.nomeOutro && <p className="text-sm text-gray-500 mt-1 truncate">Também: {apenado.nomeOutro}</p>}
                <p className="text-xs text-gray-500 mt-1">SIPE ID: {apenado.sipeId}</p>
                
                {/* Badge de Facção Real em Destaque */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {apenado.facaoRealNome ? (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                      isFaccaoConfirmada
                        ? 'bg-red-500 text-white animate-pulse shadow-sm shadow-red-500/20'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                    }`}>
                      <Shield className="w-3.5 h-3.5" />
                      {apenado.facaoRealNome} {isFaccaoConfirmada ? '(Confirmada pela Agência)' : '(Suspeita)'}
                    </span>
                  ) : apenado.faccao ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                      Facção SIPE: {apenado.faccao}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {!editing ? (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400"
                    title="Editar dados de inteligência"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400"
                    title="Deletar apenado"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : null}
              <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500">✕</button>
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">
          {/* Foto grande em tamanho real (se habilitado no layout) */}
          {isPhotoStyleFull && (
            <div className="p-5 flex justify-center bg-gray-50/50 dark:bg-gray-950/20 border-b border-gray-100 dark:border-gray-800">
              <div 
                onClick={() => {
                  if (apenado.photoPath) {
                    setZoomedPhotoUrl(`/api/aip/apenados/${apenado.id}/foto`);
                    setZoomedPhotoTitle(apenado.nome);
                  }
                }}
                className={`relative max-w-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 shadow-md ${
                  apenado.photoPath ? 'cursor-zoom-in hover:opacity-95 transition-opacity' : ''
                }`}
              >
                {apenado.photoPath ? (
                  <img
                    src={`/api/aip/apenados/${apenado.id}/foto`}
                    alt={apenado.nome}
                    className="max-h-[320px] w-auto object-contain animate-fade-in"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-40 h-40 flex items-center justify-center text-gray-400 text-5xl font-bold select-none">
                    {apenado.nome.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Renderização Dinâmica de Seções na Ordem do Layout */}
          {activeSections.map((section: any) => {
            if (!section.visible) return null

            switch (section.id) {
              case 'dados_pessoais':
                return (
                  <div key={section.id} className="p-5 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-500" />
                      {section.title || 'Dados Pessoais (SIPE)'}
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        ['SIPE ID', `#${apenado.sipeId}`],
                        ['CPF', apenado.cpf],
                        ['RG', apenado.rg],
                        ['Data Nasc.', apenado.dataNascimento],
                        ['Sexo', apenado.sexo],
                        ['Etnia', apenado.etnia],
                        ['Naturalidade', apenado.naturalidade],
                        ['Tipo Sanguíneo', apenado.tipoSanguineo],
                        ['Estado Civil', apenado.estadoCivil],
                        ['Telefone', apenado.telefone],
                        ['Nome da Mãe', apenado.nomeMae],
                        ['Nome do Pai', apenado.nomePai],
                        ['Nome do Cônjuge', apenado.nomeConjuge],
                        ['Filhos', apenado.qtdFilhos != null ? `${apenado.qtdFilhos}` : null],
                      ].map(([label, value]) => value ? (
                        <div key={String(label)}>
                          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                          <p className="text-gray-900 dark:text-white font-medium">{value}</p>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )

              case 'situacao_prisional':
                return (
                  <div key={section.id} className="p-5 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" />
                      {section.title || 'Situação Prisional (SIPE)'}
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        ['Unidade', apenado.unidade],
                        ['Cela', apenado.cela],
                        ['Regime', apenado.regime],
                        ['Situação', apenado.situacao],
                        ['Entrada', apenado.dataEntrada],
                        ['Pena', apenado.tempoPena],
                        ['Monitorado', apenado.monitorado === true ? 'Sim' : apenado.monitorado === false ? 'Não' : null],
                        ['RJI', apenado.rji],
                        ['Preso Oriundo', apenado.presoOriundo],
                        ['Intramuro', apenado.intramuro === true ? 'Sim' : apenado.intramuro === false ? 'Não' : null],
                      ].map(([label, value]) => value != null ? (
                        <div key={String(label)}>
                          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                          <p className="text-gray-900 dark:text-white font-medium">{value}</p>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )

              case 'endereco_residencial':
                if (!(apenado.logradouro || apenado.cidade || apenado.cep)) return null
                return (
                  <div key={section.id} className="p-5 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-blue-500" />
                      {section.title || 'Endereço Residencial (SIPE)'}
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 text-sm space-y-1 border border-gray-100 dark:border-gray-700/50">
                      {apenado.logradouro && (
                        <p className="text-gray-900 dark:text-white">
                          <span className="font-semibold text-gray-500">Logradouro:</span> {apenado.logradouro}
                          {apenado.numero && `, Nº ${apenado.numero}`}
                          {apenado.complemento && ` (${apenado.complemento})`}
                        </p>
                      )}
                      {apenado.bairro && (
                        <p className="text-gray-900 dark:text-white">
                          <span className="font-semibold text-gray-500">Bairro:</span> {apenado.bairro}
                        </p>
                      )}
                      {(apenado.cidade || apenado.uf) && (
                        <p className="text-gray-900 dark:text-white">
                          <span className="font-semibold text-gray-500">Cidade/UF:</span> {apenado.cidade || ''}{apenado.uf ? `/${apenado.uf}` : ''}
                        </p>
                      )}
                      {apenado.cep && (
                        <p className="text-gray-900 dark:text-white">
                          <span className="font-semibold text-gray-500">CEP:</span> {apenado.cep}
                        </p>
                      )}
                    </div>
                  </div>
                )

              case 'advogados':
                if (!(apenado.sipeApenado?.vinculosAdvogado && apenado.sipeApenado.vinculosAdvogado.length > 0)) return null
                return (
                  <div key={section.id} className="p-5 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-blue-500" />
                      {section.title || 'Advogados (SIPE)'}
                    </h3>
                    <div className="space-y-2">
                      {apenado.sipeApenado.vinculosAdvogado.map(v => (
                        <div key={v.advogado.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 rounded-xl p-3 text-sm border border-gray-100 dark:border-gray-700/50">
                          <span className="font-medium text-gray-900 dark:text-white">{v.advogado.nome}</span>
                          {v.advogado.oab && <span className="text-xs text-gray-500">OAB {v.advogado.oab}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )

              case 'dados_inteligencia':
                return (
                  <div key={section.id} className="p-5">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-500" />
                      {section.title || 'Dados de Inteligência'}
                    </h3>
                    <div className="space-y-4">
                      {/* Grid de Informações Estruturadas */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Facção Real */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Facção Real (Verificada)
                          </label>
                          {editing ? (
                            <input
                              type="text"
                              value={formData.facaoRealNome || ''}
                              onChange={e => setFormData({ ...formData, facaoRealNome: e.target.value })}
                              placeholder="Ex: PCC, CV, TCP, etc."
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-white font-medium">{formData.facaoRealNome || '(não informado)'}</p>
                          )}
                        </div>

                        {/* Nível de Confiança */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Nível de Confiança
                          </label>
                          {editing ? (
                            <select
                              value={formData.facaoNivel || ''}
                              onChange={e => setFormData({ ...formData, facaoNivel: e.target.value })}
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                            >
                              <option value="">Selecionar...</option>
                              <option value="confirmado">Confirmado</option>
                              <option value="provavel">Provável</option>
                              <option value="suspeita">Suspeita</option>
                              <option value="improvavel">Improvável</option>
                              <option value="negado">Negado</option>
                            </select>
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-white font-medium">{formData.facaoNivel || '(não informado)'}</p>
                          )}
                        </div>

                        {/* Vulgo / Apelido */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Vulgo / Apelido
                          </label>
                          {editing ? (
                            <input
                              type="text"
                              value={formData.vulgo || ''}
                              onChange={e => setFormData({ ...formData, vulgo: e.target.value })}
                              placeholder="Ex: Baixinho, Gordinho, etc."
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-white font-medium">{formData.vulgo || '(não informado)'}</p>
                          )}
                        </div>

                        {/* Relevância na Facção */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Relevância na Facção
                          </label>
                          {editing ? (
                            <select
                              value={formData.facaoRelevancia || ''}
                              onChange={e => setFormData({ ...formData, facaoRelevancia: e.target.value })}
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                            >
                              <option value="">Selecionar...</option>
                              <option value="Membro">Membro</option>
                              <option value="Membro de Relevância">Membro de Relevância</option>
                              <option value="Liderança">Liderança</option>
                              <option value="Já exerceu Liderança">Já exerceu Liderança</option>
                            </select>
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-white font-medium">{formData.facaoRelevancia || '(não informado)'}</p>
                          )}
                        </div>
                      </div>

                      {/* Notas de Inteligência */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Notas de Inteligência
                        </label>
                        {editing ? (
                          <textarea
                            value={formData.notasInteligencia || ''}
                            onChange={e => setFormData({ ...formData, notasInteligencia: e.target.value })}
                            placeholder="Documentar observações, análises, vinculações..."
                            rows={4}
                            className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                          />
                        ) : (
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {formData.notasInteligencia || '(nenhuma nota)'}
                          </p>
                        )}
                      </div>

                      {/* Observações */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Observações Adicionais
                        </label>
                        {editing ? (
                          <textarea
                            value={formData.observacoes || ''}
                            onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                            placeholder="Informações complementares..."
                            rows={3}
                            className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                          />
                        ) : (
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {formData.observacoes || '(nenhuma observação)'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )

              case 'visitantes':
                if (!(apenado.fotoVisitantes && apenado.fotoVisitantes.length > 0)) return null
                return (
                  <div key={section.id} className="p-5 border-t border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-500" />
                      {section.title || 'Visitantes Cadastrados'}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {apenado.fotoVisitantes.map(v => (
                        <div key={v.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl p-3 text-sm relative border border-gray-100 dark:border-gray-700/50">
                          {/* Badge de Ativo/Inativo */}
                          <span className={`absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold rounded-md ${
                            v.ativoVisitante 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                          }`}>
                            {v.ativoVisitante ? 'Ativo' : 'Inativo'}
                          </span>
                          
                          {/* Foto do Visitante com zoom */}
                          <div
                            onClick={() => {
                              if (v.photoPath && v.visitanteId) {
                                setZoomedPhotoUrl(`/api/sipe/visitantes/${v.visitanteId}/foto`);
                                setZoomedPhotoTitle(v.nomeVisitante || 'Visitante');
                              }
                            }}
                            className={`${
                               isPhotoStyleFull 
                                 ? 'w-16 h-20 rounded-xl' 
                                 : 'w-10 h-10 rounded-lg'
                             } overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-400 select-none transition-all ${
                               v.photoPath && v.visitanteId ? 'cursor-zoom-in hover:opacity-90 active:scale-95' : ''
                             }`}
                          >
                            {v.photoPath && v.visitanteId ? (
                              <img
                                src={`/api/sipe/visitantes/${v.visitanteId}/foto`}
                                alt={v.nomeVisitante || 'Visitante'}
                                className={`w-full h-full ${
                                   isPhotoStyleFull ? 'object-contain' : 'object-cover'
                                 }`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <User className={isPhotoStyleFull ? 'w-8 h-8' : 'w-5 h-5'} />
                            )}
                          </div>
                          
                          {/* Informações do Visitante */}
                          <div className="min-w-0 flex-1 pr-12">
                            <p className="font-semibold text-gray-900 dark:text-white truncate">
                              {v.nomeVisitante || '—'}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {v.parentescoVisitante && <span className="font-medium text-purple-600 dark:text-purple-400">{v.parentescoVisitante}</span>}
                              {v.parentescoVisitante && v.cpfVisitante && <span> · </span>}
                              {v.cpfVisitante && <span>CPF: {v.cpfVisitante}</span>}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )

              default:
                return null
            }
          })}
        </div>

        {/* Confirmação de Deleção */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[51] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
            <div
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Deletar Apenado?</h3>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Você tem certeza que deseja deletar <strong>{apenado.nome}</strong> do AIP? Esta ação não pode ser desfeita.
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Deletar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {editing && (
          <div className="flex items-center gap-3 p-5 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <button
              onClick={() => {
                setFormData(apenado)
                setEditing(false)
              }}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
          </div>
        )}
      </div>

      {/* Lightbox para zoom da imagem */}
      {zoomedPhotoUrl && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md cursor-zoom-out p-4"
          onClick={() => setZoomedPhotoUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
            <img
              src={zoomedPhotoUrl}
              alt={zoomedPhotoTitle || apenado.nome}
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-gray-800 animate-in fade-in zoom-in-95 duration-200"
            />
            <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-semibold backdrop-blur-sm">
              {zoomedPhotoTitle || apenado.nome}
            </div>
            <button
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors backdrop-blur-sm text-lg"
              onClick={(e) => {
                e.stopPropagation()
                setZoomedPhotoUrl(null)
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function AIPanel({ userRole }: { userRole?: string }) {
  const [apenados, setApenados] = useState<AIPApenado[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedApenado, setSelectedApenado] = useState<AIPApenado | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [layout, setLayout] = useState<any>(null)
  const [showLayoutConfig, setShowLayoutConfig] = useState(false)

  const LIMIT = 20

  const fetchLayout = useCallback(async () => {
    try {
      const res = await fetch('/api/aip/layout')
      if (res.ok) {
        const data = await res.json()
        setLayout(data)
      }
    } catch (error) {
      console.error('Erro ao carregar layout:', error)
    }
  }, [])

  useEffect(() => {
    fetchLayout()
  }, [fetchLayout])

  const fetchApenados = useCallback(async (p: number, q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT)
      })
      if (q) params.set('q', q)

      const res = await fetch(`/api/aip/apenados?${params}`)
      if (res.ok) {
        const data = await res.json()
        setApenados(data.apenados)
        setTotal(data.total)
        setTotalPages(data.totalPages)
        setPage(p)
      }
    } catch (error) {
      console.error('Erro ao buscar apenados:', error)
      toast.error('Erro ao carregar apenados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchApenados(1, searchQuery)
  }, [searchQuery, fetchApenados])

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    setPage(1)
  }

  const handlePageChange = (newPage: number) => {
    fetchApenados(newPage, searchQuery)
  }

  const handleUpdate = (updated: AIPApenado) => {
    setApenados(apenados.map(a => a.id === updated.id ? updated : a))
    setSelectedApenado(updated)
  }

  const handleDelete = async (id: string) => {
    setApenados(apenados.filter(a => a.id !== id))
    setSelectedApenado(null)
    // Recarregar a lista se necessário
    await fetchApenados(page, searchQuery)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-500" />
            Análise de Inteligência Penal
          </h2>
          <p className="text-sm text-gray-500 mt-1">{total} apenado{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''}</p>
        </div>

        {userRole === 'SUPER_ADMIN' && (
          <button
            onClick={() => setShowLayoutConfig(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/20 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded-lg border border-purple-200 dark:border-purple-900/50 transition-colors shadow-sm"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurar Ficha
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nome ou CPF..."
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Grid de Apenados */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : apenados.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
          <Brain className="w-8 h-8 opacity-30" />
          <p className="text-sm">Nenhum apenado registrado em AIP</p>
          <p className="text-xs">Cadastre apenados do SIPE para começar a análise</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apenados.map(a => (
              <AIApenadoCard
                key={a.id}
                apenado={a}
                onSelect={setSelectedApenado}
              />
            ))}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500">
                Página {page} de {totalPages} • {total} registros
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 text-gray-600 dark:text-gray-400"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 text-gray-600 dark:text-gray-400"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {selectedApenado && (
        <AIApenadoModal
          apenado={selectedApenado}
          layout={layout}
          onClose={() => setSelectedApenado(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}

      {/* Modal de Configuração de Layout */}
      {showLayoutConfig && (
        <AIFichaLayoutModal
          layout={layout}
          onClose={() => setShowLayoutConfig(false)}
          onSave={(newLayout) => {
            setLayout(newLayout)
            setShowLayoutConfig(false)
          }}
        />
      )}
    </div>
  )
}

// ── Modal de Configuração de Layout pelo Superadmin ──────────────────
function AIFichaLayoutModal({ layout, onClose, onSave }: {
  layout: any
  onClose: () => void
  onSave: (newLayout: any) => void
}) {
  const [photoStyle, setPhotoStyle] = useState(layout?.photoStyle || 'avatar')
  const [sections, setSections] = useState<any[]>(
    layout?.sections || [
      { id: 'dados_pessoais', title: 'Dados Pessoais (SIPE)', visible: true },
      { id: 'situacao_prisional', title: 'Situação Prisional (SIPE)', visible: true },
      { id: 'endereco_residencial', title: 'Endereço Residencial (SIPE)', visible: true },
      { id: 'advogados', title: 'Advogados (SIPE)', visible: true },
      { id: 'dados_inteligencia', title: 'Dados de Inteligência', visible: true },
      { id: 'visitantes', title: 'Visitantes Cadastrados', visible: true }
    ]
  )
  const [saving, setSaving] = useState(false)

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= sections.length) return

    const updated = [...sections]
    const temp = updated[index]
    updated[index] = updated[nextIndex]
    updated[nextIndex] = temp
    setSections(updated)
  }

  const handleToggleVisible = (index: number) => {
    const updated = [...sections]
    updated[index].visible = !updated[index].visible
    setSections(updated)
  }

  const handleTitleChange = (index: number, newTitle: string) => {
    const updated = [...sections]
    updated[index].title = newTitle
    setSections(updated)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/aip/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoStyle,
          sections
        })
      })

      if (res.ok) {
        const data = await res.json()
        onSave(data.layout)
        toast.success('Layout da ficha atualizado com sucesso')
      } else {
        toast.error('Erro ao salvar layout')
      }
    } catch (e) {
      console.error(e)
      toast.error('Erro de conexão ao salvar layout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white font-semibold">Configurar Layout da Ficha</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500">✕</button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Estilo da Foto */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-850 dark:text-gray-200">Foto de Perfil do Apenado</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPhotoStyle('avatar')}
                className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-1.5 ${
                  photoStyle === 'avatar'
                    ? 'border-purple-600 bg-purple-50/10 dark:border-purple-500 dark:bg-purple-950/10'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                <span className="font-semibold text-sm text-gray-900 dark:text-white">Avatar (Padrão)</span>
                <span className="text-xs text-gray-550">Foto pequena recortada ao lado do nome do apenado.</span>
              </button>
              <button
                onClick={() => setPhotoStyle('full')}
                className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-1.5 ${
                  photoStyle === 'full'
                    ? 'border-purple-600 bg-purple-50/10 dark:border-purple-500 dark:bg-purple-950/10'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                <span className="font-semibold text-sm text-gray-900 dark:text-white">Tamanho Real (Destaque)</span>
                <span className="text-xs text-gray-550">Foto original sem recortes, exibida de forma ampla no topo.</span>
              </button>
            </div>
          </div>

          {/* Reordenação e Visibilidade de Seções */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-855 dark:text-gray-200">Ordem e Visibilidade das Seções</h3>
              <span className="text-xs text-gray-500">Ordene usando as setas</span>
            </div>

            <div className="space-y-2">
              {sections.map((section, index) => (
                <div 
                  key={section.id} 
                  className={`flex items-center gap-3 bg-gray-50/70 dark:bg-gray-800/40 rounded-xl p-3 border transition-all ${
                    section.visible 
                      ? 'border-gray-250 dark:border-gray-800/60' 
                      : 'border-gray-100 dark:border-gray-900 opacity-60'
                  }`}
                >
                  {/* Visibilidade Checkbox */}
                  <button
                    onClick={() => handleToggleVisible(index)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      section.visible 
                        ? 'text-purple-600 hover:bg-purple-100/50 dark:text-purple-400 dark:hover:bg-purple-950/30' 
                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    title={section.visible ? 'Ocultar Seção' : 'Exibir Seção'}
                  >
                    {section.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>

                  {/* Input Título da Seção */}
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) => handleTitleChange(index, e.target.value)}
                    disabled={!section.visible}
                    className="flex-1 text-sm bg-transparent border-b border-transparent focus:border-purple-500 hover:border-gray-300 dark:hover:border-gray-700 py-0.5 text-gray-900 dark:text-white focus:outline-none disabled:opacity-50 font-medium"
                  />

                  {/* Botões Ordenação */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMove(index, 'up')}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-750 disabled:opacity-20 text-gray-600 dark:text-gray-400"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMove(index, 'down')}
                      disabled={index === sections.length - 1}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-750 disabled:opacity-20 text-gray-600 dark:text-gray-400"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Layout
          </button>
        </div>
      </div>
    </div>
  )
}
