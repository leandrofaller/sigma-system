'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, Shield, User, FileText, Briefcase, MapPin, Clock, Users, Image, Brain, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface Alcunha { alcunha: string }
interface Faccao { id: string; nome: string; sigla: string | null; cor: string }
interface Advogado { id: string; nome: string; oab: string | null }
interface VinculoAdvogado { advogado: Advogado }
interface Visitante {
  id: string
  nome: string
  cpf: string | null
  parentesco: string | null
  photoPath: string | null
}
interface VinculoVisitante {
  visitante: Visitante
  ativo: boolean
}
interface Processo {
  id: string
  sipeProcessoId: number | null
  numero: string | null
  vara: string | null
  artigos: string[]
  tempoPena: string | null
  principal: boolean
}

interface Historico {
  id: string
  tipo: string
  descricao: string
  datahora: string | null
  cela: string | null
  unidade: string | null
}

interface FotoComplementar {
  id: string
  photoPath: string
  descricao: string | null
  createdAt: string
}

export interface ApenadoImportado {
  id: string
  sipeId: number
  nome: string
  nomeOutro: string | null
  cpf: string | null
  rg: string | null
  dataNascimento: string | null
  etnia: string | null
  sexo: string | null
  unidade: string | null
  cela: string | null
  regime: string | null
  situacao: string | null
  dataEntrada: string | null
  tempoPena: string | null
  monitorado: boolean | null
  photoPath: string | null
  faccao: Faccao | null
  alcunhas: Alcunha[]
  processos: Processo[]
  vinculosAdvogado: VinculoAdvogado[]
  vinculosVisitante: VinculoVisitante[]
  historicos: Historico[]
  fotosComplementares: FotoComplementar[]
  ultimaSyncAt: string

  // Novos campos do SIPE
  naturalidade: string | null
  tipoSanguineo: string | null
  estadoCivil: string | null
  telefone: string | null
  nomeMae: string | null
  nomePai: string | null
  nomeConjuge: string | null
  qtdFilhos: number | null
  rji: string | null
  presoOriundo: string | null
  intramuro: boolean | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  apenado?: { photoPath: string | null } | null
}

export function ApenadoFoto({
  id,
  nome,
  photoPath,
  className = "w-14 h-14 rounded-xl",
  fallbackIcon: FallbackIcon = User,
  fallbackText,
  onClick,
  apiPhotoPrefix = "/api/sipe/apenados"
}: {
  id: string
  nome: string
  photoPath: string | null | undefined
  className?: string
  fallbackIcon?: React.ComponentType<{ className?: string }>
  fallbackText?: string
  onClick?: () => void
  apiPhotoPrefix?: string
}) {
  const [hasError, setHasError] = useState(false)

  const showPhoto = photoPath && !hasError

  return (
    <div
      onClick={onClick}
      className={`${className} overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-bold select-none border border-gray-200/60 dark:border-gray-700/50 bg-gray-100 dark:bg-gray-800 text-gray-400 ${
        onClick ? 'cursor-pointer animate-duration-200' : ''
      }`}
    >
      {showPhoto ? (
        <img
          src={`${apiPhotoPrefix}/${id}/foto`}
          alt={nome}
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : fallbackText ? (
        <div className="w-full h-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-lg">
          {fallbackText}
        </div>
      ) : (
        <FallbackIcon className="w-1/2 h-1/2 text-gray-400" />
      )}
    </div>
  )
}

export function ApenadoCard({ apenado, onClick, apiPhotoPrefix = "/api/sipe/apenados" }: { apenado: ApenadoImportado; onClick: () => void; apiPhotoPrefix?: string }) {
  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-red-300 dark:hover:border-red-700 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="flex gap-4">
        {/* Foto */}
        <ApenadoFoto
          id={apenado.id}
          nome={apenado.nome}
          photoPath={apenado.photoPath || apenado.apenado?.photoPath}
          className="w-14 h-14 rounded-xl"
          fallbackText={apenado.nome.charAt(0)}
          apiPhotoPrefix={apiPhotoPrefix}
        />

        {/* Informações */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">{apenado.nome}</span>
                {apenado.faccao && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: apenado.faccao.cor || '#ef4444' }}
                  >
                    {apenado.faccao.sigla || apenado.faccao.nome}
                  </span>
                )}
              </div>
              {apenado.alcunhas.length > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {apenado.alcunhas.map(a => `"${a.alcunha}"`).join(', ')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                {apenado.dataNascimento && <span>Nasc: {apenado.dataNascimento}</span>}
                {apenado.rg && <span>RG: {apenado.rg}</span>}
                {apenado.cpf && <span>CPF: {apenado.cpf}</span>}
              </div>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
              <p className="font-mono text-gray-400">#{apenado.sipeId}</p>
              {apenado.regime && (
                <span className="inline-block mt-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                  {apenado.regime}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-4 text-xs text-gray-500">
        {apenado.unidade && (
          <span className="truncate flex-1">{apenado.unidade}</span>
        )}
        <div className="flex items-center gap-3 shrink-0">
          {apenado.processos.length > 0 && (
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {apenado.processos.length} processo{apenado.processos.length > 1 ? 's' : ''}
            </span>
          )}
          {apenado.vinculosAdvogado.length > 0 && (
            <span className="flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              {apenado.vinculosAdvogado.length} advogado{apenado.vinculosAdvogado.length > 1 ? 's' : ''}
            </span>
          )}
          {apenado.vinculosVisitante && apenado.vinculosVisitante.length > 0 && (
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {apenado.vinculosVisitante.length} visitante{apenado.vinculosVisitante.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ApenadoModal({
  apenado: initialApenado,
  onClose,
  onUpdate,
  apiPhotoPrefix = "/api/sipe/apenados"
}: {
  apenado: ApenadoImportado;
  onClose: () => void;
  onUpdate?: (updated: ApenadoImportado) => void;
  apiPhotoPrefix?: string
}) {
  const [apenado, setApenado] = useState<ApenadoImportado>(initialApenado)
  const [zoomedPhotoUrl, setZoomedPhotoUrl] = useState<string | null>(null)
  const [zoomedPhotoTitle, setZoomedPhotoTitle] = useState<string>('')
  const [cadastrandoEmAIP, setCadastrandoEmAIP] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const skipNextInitialUpdate = useRef(false)

  useEffect(() => {
    if (skipNextInitialUpdate.current) {
      skipNextInitialUpdate.current = false
      return
    }
    setApenado(initialApenado)
  }, [initialApenado])

  const handleSincronizarSipe = async () => {
    setSincronizando(true)
    const toastId = toast.loading(`Sincronizando dados de ${apenado.nome} com o SIPE...`)
    try {
      const res = await fetch(`/api/sipe/apenados/${apenado.id}/sync`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erro na requisição')
      }
      toast.success('Ficha do apenado atualizada com sucesso!', { id: toastId })
      if (data.apenado) {
        skipNextInitialUpdate.current = true
        setApenado(data.apenado)
        if (onUpdate) onUpdate(data.apenado)
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Falha ao sincronizar com o SIPE', { id: toastId })
    } finally {
      setSincronizando(false)
    }
  }

  const handleCadastrarEmAIP = async () => {
    setCadastrandoEmAIP(true)
    try {
      const res = await fetch('/api/aip/apenados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sipeApenadoId: apenado.sipeId,
          cadastradoPor: 'current-user' // TODO: integrar com auth real
        })
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Apenado cadastrado em AIP com sucesso!')
      } else if (res.status === 409) {
        toast.info('Apenado já cadastrado em AIP')
      } else {
        toast.error(data.message || 'Erro ao cadastrar em AIP')
      }
    } catch (error) {
      console.error('Erro ao cadastrar em AIP:', error)
      toast.error('Erro ao cadastrar em AIP')
    } finally {
      setCadastrandoEmAIP(false)
    }
  }

  const getPhotoUrl = (path: string) => {
    if (path.startsWith('uploads/')) {
      return `/api/${path}`;
    }
    return `/api/uploads/${path}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-2xl h-[92vh] md:h-auto md:max-h-[85vh] overflow-y-auto transition-all duration-300 flex flex-col" 
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle visual para mobile */}
        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto my-3 md:hidden shrink-0" />
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4 items-start">
              {/* Foto grande */}
              <ApenadoFoto
                id={apenado.id}
                nome={apenado.nome}
                photoPath={apenado.photoPath || apenado.apenado?.photoPath}
                className={`w-28 h-28 rounded-2xl text-4xl shrink-0 ${
                  (apenado.photoPath || apenado.apenado?.photoPath) ? 'cursor-zoom-in hover:opacity-90 active:scale-95 transition-all' : ''
                }`}
                fallbackText={apenado.nome.charAt(0)}
                apiPhotoPrefix={apiPhotoPrefix}
                onClick={() => {
                  const finalPath = apenado.photoPath || apenado.apenado?.photoPath
                  if (finalPath) {
                    setZoomedPhotoUrl(`${apiPhotoPrefix}/${apenado.id}/foto`);
                    setZoomedPhotoTitle(apenado.nome);
                  }
                }}
              />

              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{apenado.nome}</h2>
                    {apenado.faccao && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white shrink-0" style={{ backgroundColor: apenado.faccao.cor || '#ef4444' }}>
                        {apenado.faccao.sigla || apenado.faccao.nome}
                      </span>
                    )}
                  </div>
                  {apenado.nomeOutro && <p className="text-sm text-gray-500 mt-1">Também: {apenado.nomeOutro}</p>}
                  {apenado.alcunhas.length > 0 && (
                    <p className="text-sm text-gray-500 mt-0.5">Alcunha: {apenado.alcunhas.map(a => `"${a.alcunha}"`).join(', ')}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleCadastrarEmAIP}
                    disabled={cadastrandoEmAIP || sincronizando}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 rounded-xl disabled:opacity-50 transition-all active:scale-95 shadow-sm shadow-purple-500/10"
                  >
                    {cadastrandoEmAIP ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                    Cadastrar em AIP
                  </button>

                  <button
                    onClick={handleSincronizarSipe}
                    disabled={cadastrandoEmAIP || sincronizando}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 rounded-xl disabled:opacity-50 transition-all active:scale-95 shadow-sm shadow-blue-500/10"
                  >
                    {sincronizando ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Atualizar SIPE
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center">
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                title="Fechar"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Dados Pessoais */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" /> Dados Pessoais
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
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-gray-900 dark:text-white font-medium">{value}</p>
                </div>
              ) : null)}
            </div>
          </section>

          {/* Dados Prisionais */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" /> Situação Prisional
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
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-gray-900 dark:text-white font-medium">{value}</p>
                </div>
              ) : null)}
            </div>
          </section>

          {/* Endereço Residencial */}
          {(apenado.logradouro || apenado.cidade || apenado.cep) && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Endereço Residencial
              </h3>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-sm space-y-1">
                {apenado.logradouro && (
                  <p className="text-gray-900 dark:text-white">
                    <span className="font-semibold">Logradouro:</span> {apenado.logradouro}
                    {apenado.numero && `, Nº ${apenado.numero}`}
                    {apenado.complemento && ` (${apenado.complemento})`}
                  </p>
                )}
                {apenado.bairro && (
                  <p className="text-gray-900 dark:text-white">
                    <span className="font-semibold">Bairro:</span> {apenado.bairro}
                  </p>
                )}
                {(apenado.cidade || apenado.uf) && (
                  <p className="text-gray-900 dark:text-white">
                    <span className="font-semibold">Cidade/UF:</span> {apenado.cidade || ''}{apenado.uf ? `/${apenado.uf}` : ''}
                  </p>
                )}
                {apenado.cep && (
                  <p className="text-gray-900 dark:text-white">
                    <span className="font-semibold">CEP:</span> {apenado.cep}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Processos */}
          {apenado.processos.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Processos
              </h3>
              <div className="space-y-2">
                {apenado.processos.map(p => (
                  <div key={p.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-sm relative">
                    {p.principal && (
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] font-bold rounded-md">
                        Principal
                      </span>
                    )}
                    <p className="font-mono text-xs text-gray-500">{p.numero || 'Nº não informado'}</p>
                    {p.vara && <p className="text-gray-700 dark:text-gray-300 mt-1"><span className="font-semibold">Vara:</span> {p.vara}</p>}
                    {p.tempoPena && <p className="text-gray-700 dark:text-gray-300 text-xs mt-0.5"><span className="font-semibold">Pena:</span> {p.tempoPena}</p>}
                    {p.artigos.length > 0 && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-medium">{p.artigos.join(' · ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Histórico de Movimentações */}
          {apenado.historicos && apenado.historicos.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Histórico de Movimentações
              </h3>
              <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2.5 pl-4 space-y-4">
                {apenado.historicos.map(h => (
                  <div key={h.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-600 ring-4 ring-white dark:ring-gray-800" />
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-bold text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                        {h.tipo}
                      </span>
                      {h.datahora && (
                        <span className="text-xs text-gray-400 font-mono">
                          {new Date(h.datahora).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 font-medium">
                      {h.descricao}
                    </p>
                    {(h.unidade || h.cela) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {h.unidade && <span>{h.unidade}</span>}
                        {h.unidade && h.cela && <span> · </span>}
                        {h.cela && <span>Cela: {h.cela}</span>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Advogados */}
          {apenado.vinculosAdvogado.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Advogados
              </h3>
              <div className="space-y-2">
                {apenado.vinculosAdvogado.map(v => (
                  <div key={v.advogado.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">{v.advogado.nome}</span>
                    {v.advogado.oab && <span className="text-xs text-gray-500">OAB {v.advogado.oab}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Visitantes */}
          {apenado.vinculosVisitante && apenado.vinculosVisitante.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" /> Visitantes Cadastrados
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {apenado.vinculosVisitante.map(v => (
                  <div key={v.visitante.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-sm relative">
                    {/* Active/Inactive Badge */}
                    <span className={`absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold rounded-md ${
                      v.ativo 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                        : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
                    }`}>
                      {v.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    
                    {/* Visitor Photo */}
                    <div
                      onClick={() => {
                        if (v.visitante.photoPath) {
                          setZoomedPhotoUrl(`/api/sipe/visitantes/${v.visitante.id}/foto`);
                          setZoomedPhotoTitle(v.visitante.nome);
                        }
                      }}
                      className={`w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-400 select-none ${
                        v.visitante.photoPath ? 'cursor-zoom-in hover:opacity-90 active:scale-95 transition-all' : ''
                      }`}
                    >
                      {v.visitante.photoPath ? (
                        <img
                          src={`/api/sipe/visitantes/${v.visitante.id}/foto`}
                          alt={v.visitante.nome}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <User className="w-5 h-5" />
                      )}
                    </div>
                    
                    {/* Visitor Info */}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white truncate pr-12">
                        {v.visitante.nome}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {v.visitante.parentesco && <span className="font-medium text-red-600 dark:text-red-400">{v.visitante.parentesco}</span>}
                        {v.visitante.parentesco && v.visitante.cpf && <span> · </span>}
                        {v.visitante.cpf && <span>CPF: {v.visitante.cpf}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Fotos Complementares */}
          {apenado.fotosComplementares && apenado.fotosComplementares.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Image className="w-4 h-4 text-red-600 dark:text-red-400" /> Galeria de Fotos Complementares
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {apenado.fotosComplementares.map((foto) => {
                  const url = getPhotoUrl(foto.photoPath);
                  return (
                    <div
                      key={foto.id}
                      onClick={() => {
                        setZoomedPhotoUrl(url);
                        setZoomedPhotoTitle(foto.descricao || 'Foto Complementar');
                      }}
                      className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 cursor-zoom-in border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200"
                    >
                      <img
                        src={url}
                        alt={foto.descricao || 'Foto Complementar'}
                        className="w-full h-full object-cover group-hover:opacity-90"
                      />
                      {foto.descricao && (
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-1.5 text-[10px] text-white font-medium truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          {foto.descricao}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
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
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-gray-800"
            />
            <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-semibold backdrop-blur-sm">
              {zoomedPhotoTitle || apenado.nome}
            </div>
            <button
              className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-colors backdrop-blur-sm"
              onClick={(e) => {
                e.stopPropagation()
                setZoomedPhotoUrl(null)
              }}
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface ApenadosImportadosProps {
  apiEndpoint?: string
  apiPhotoPrefix?: string
}

export function ApenadosImportados({
  apiEndpoint = '/api/sipe/apenados',
  apiPhotoPrefix = '/api/sipe/apenados'
}: ApenadosImportadosProps) {
  const [apenados, setApenados] = useState<ApenadoImportado[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [q, setQ] = useState('')
  const [faccaoId, setFaccaoId] = useState('')
  const [unidade, setUnidade] = useState('')
  const [situacao, setSituacao] = useState('')
  const [faccoes, setFaccoes] = useState<Faccao[]>([])
  const [unidades, setUnidades] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<ApenadoImportado | null>(null)

  // Situações padrão do SIPE
  const SITUACOES = [
    'Em Liberdade',
    'Solto',
    'Apenado Preso',
    'Fuga',
    'Evasão / Abandono',
    'Prisão Domiciliar',
    'Livramento Condicional',
    'Óbito em Fuga',
    'Óbito',
    'Preso Recambiado',
    'DEPEN',
    'Descumprimento de cautelar',
  ]

  const fetchFaccoes = async () => {
    const res = await fetch('/api/sipe/faccoes')
    if (res.ok) setFaccoes(await res.json())
  }

  const fetchUnidades = async () => {
    try {
      const res = await fetch('/api/sipe/unidades')
      if (res.ok) {
        const data = await res.json()
        const unidadeNames = Array.from(new Set(
          data.unidades?.map((u: any) => u.nome).filter((n: string) => n) || []
        )).sort() as string[]
        setUnidades(unidadeNames)
      }
    } catch (err) {
      console.error('Erro ao carregar unidades:', err)
    }
  }

  const fetchApenados = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '24' })
    if (q) params.set('q', q)
    if (faccaoId) params.set('faccaoId', faccaoId)
    if (unidade) params.set('unidade', unidade)
    if (situacao) params.set('situacao', situacao)

    const res = await fetch(`${apiEndpoint}?${params}`)
    if (res.ok) {
      const data = await res.json()
      setApenados(data.apenados)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    }
    setLoading(false)
  }, [page, q, faccaoId, unidade, situacao])

  useEffect(() => { fetchFaccoes(); fetchUnidades() }, [])
  useEffect(() => { fetchApenados() }, [fetchApenados])

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, CPF, RG ou alcunha..."
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>
        <select
          value={faccaoId}
          onChange={e => { setFaccaoId(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">Todas as facções</option>
          {faccoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <select
          value={unidade}
          onChange={e => { setUnidade(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">Todas as unidades</option>
          {unidades.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select
          value={situacao}
          onChange={e => { setSituacao(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">Todas as situações</option>
          {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center text-sm text-gray-500">
          {total} apenado{total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Carregando...</div>
        ) : apenados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <Shield className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhum apenado importado ainda</p>
            <p className="text-xs">Use a aba Sincronização para importar dados do SIPE</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {apenados.map(a => (
              <ApenadoCard key={a.id} apenado={a} onClick={() => setSelected(a)} apiPhotoPrefix={apiPhotoPrefix} />
            ))}
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {selected && (
        <ApenadoModal 
          apenado={selected} 
          onClose={() => setSelected(null)} 
          onUpdate={(updated) => {
            setSelected(updated)
            setApenados(prev => prev.map(a => a.id === updated.id ? updated : a))
          }}
          apiPhotoPrefix={apiPhotoPrefix} 
        />
      )}
    </div>
  )
}
