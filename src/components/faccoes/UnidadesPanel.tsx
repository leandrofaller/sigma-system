'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, Shield, Building2, Users, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { ApenadoCard, ApenadoModal } from './ApenadosImportados'
import type { ApenadoImportado } from './ApenadosImportados'
import { UnidadesDashboard } from './UnidadesDashboard'
import { containsNormalized } from '@/lib/search'

interface Unidade {
  id: string
  nome: string
}

interface UnidadesPanelProps {
  apiEndpoint?: string
  apiApenadosEndpoint?: string
  apiPhotoPrefix?: string
  apiDashboardEndpoint?: string
}

export function UnidadesPanel({
  apiEndpoint = '/api/sipe/unidades',
  apiApenadosEndpoint = '/api/sipe/apenados',
  apiPhotoPrefix = '/api/sipe/apenados',
  apiDashboardEndpoint = '/api/sipe/unidades/stats'
}: UnidadesPanelProps) {
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [searchUnidade, setSearchUnidade] = useState('')
  const [selectedUnidade, setSelectedUnidade] = useState<Unidade | null>(null)
  
  const [apenados, setApenados] = useState<ApenadoImportado[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchApenado, setSearchApenado] = useState('')
  const [loadingUnidades, setLoadingUnidades] = useState(false)
  const [loadingApenados, setLoadingApenados] = useState(false)
  const [selectedApenado, setSelectedApenado] = useState<ApenadoImportado | null>(null)

  // Carrega as unidades prisionais
  const fetchUnidades = async () => {
    setLoadingUnidades(true)
    try {
      const res = await fetch(apiEndpoint)
      if (res.ok) {
        const data = await res.json()
        setUnidades(data.unidades || [])
      }
    } catch (err) {
      console.error('Erro ao buscar unidades:', err)
    } finally {
      setLoadingUnidades(false)
    }
  }

  // Carrega apenados filtrados por unidade
  const fetchApenados = useCallback(async () => {
    if (!selectedUnidade) {
      setApenados([])
      setTotal(0)
      return
    }

    setLoadingApenados(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '12',
        unidade: selectedUnidade.nome
      })
      if (searchApenado) {
        params.set('q', searchApenado)
      }

      const res = await fetch(`${apiApenadosEndpoint}?${params}`)
      if (res.ok) {
        const data = await res.json()
        setApenados(data.apenados || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
      }
    } catch (err) {
      console.error('Erro ao buscar apenados:', err)
    } finally {
      setLoadingApenados(false)
    }
  }, [selectedUnidade, page, searchApenado])

  useEffect(() => {
    fetchUnidades()
  }, [])

  useEffect(() => {
    setPage(1)
    fetchApenados()
  }, [selectedUnidade, searchApenado])

  useEffect(() => {
    fetchApenados()
  }, [page])

  // Filtra unidades pelo input de busca
  const filteredUnidades = unidades.filter(u =>
    containsNormalized(u.nome, searchUnidade)
  )

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-210px)] min-h-[450px] gap-6 overflow-hidden">
      {/* Sidebar de Unidades */}
      <div className="w-full lg:w-80 flex flex-col bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-red-600 dark:text-red-400" />
            Unidades Prisionais
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar unidade..."
              value={searchUnidade}
              onChange={e => setSearchUnidade(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingUnidades ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-xs">
              Carregando unidades...
            </div>
          ) : filteredUnidades.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">
              Nenhuma unidade encontrada
            </div>
          ) : (
            filteredUnidades.map(u => {
              const isSelected = selectedUnidade?.id === u.id
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUnidade(u)}
                  className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all group ${
                    isSelected
                      ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/30 shadow-sm'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300 border border-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-xs font-semibold truncate leading-tight">
                      {u.nome}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">
                      ID SIPE: #{u.id}
                    </p>
                  </div>
                  <ChevronRightIcon className={`w-4 h-4 shrink-0 transition-transform ${
                    isSelected ? 'translate-x-0.5 text-red-500' : 'text-gray-400 group-hover:translate-x-0.5'
                  }`} />
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Grid de Apenados */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {selectedUnidade ? (
          <>
            {/* Header da Unidade Selecionada */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex flex-wrap gap-4 items-center justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {selectedUnidade.nome}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {total} apenado{total !== 1 ? 's' : ''} nesta unidade
                </p>
              </div>

              {/* Filtro de Busca de Apenados */}
              <div className="w-full sm:w-64 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, CPF, nome da mãe ou alcunha..."
                  value={searchApenado}
                  onChange={e => setSearchApenado(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Listagem */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingApenados ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                  Carregando apenados...
                </div>
              ) : apenados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
                  <Shield className="w-8 h-8 opacity-30" />
                  <p className="text-sm">Nenhum apenado encontrado</p>
                  <p className="text-xs">
                    {searchApenado ? 'Tente ajustar os termos da busca' : 'Nenhum apenado importado para esta unidade'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {apenados.map(a => (
                    <ApenadoCard key={a.id} apenado={a} onClick={() => setSelectedApenado(a)} apiPhotoPrefix={apiPhotoPrefix} />
                  ))}
                </div>
              )}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2 shrink-0 bg-gray-50/30 dark:bg-gray-800/30">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
                <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            )}
          </>
        ) : searchUnidade.trim() === '' ? (
          <UnidadesDashboard endpoint={apiDashboardEndpoint} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 p-8">
            <Building2 className="w-12 h-12 text-gray-300 dark:text-gray-700 animate-pulse" />
            <p className="text-sm font-medium">Selecione uma unidade prisional</p>
            <p className="text-xs text-gray-500 max-w-xs text-center">
              Escolha uma das unidades na barra lateral para listar os respectivos apenados importados.
            </p>
          </div>
        )}
      </div>

      {selectedApenado && (
        <ApenadoModal 
          apenado={selectedApenado} 
          onClose={() => setSelectedApenado(null)} 
          apiPhotoPrefix={apiPhotoPrefix} 
          onUpdate={(updated) => {
            setApenados(prev => prev.map(a => a.id === updated.id ? updated : a))
            setSelectedApenado(updated)
          }}
        />
      )}
    </div>
  )
}
