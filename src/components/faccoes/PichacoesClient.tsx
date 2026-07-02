'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Paintbrush, Plus, Eye, Pencil, Trash2, Search, X, Check, Loader2,
  MapPin, Grid, Map, Image as ImageIcon, Calendar, User, Compass,
  ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Upload
} from 'lucide-react';

const PichacoesMap = dynamic(() => import('./PichacoesMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] rounded-2xl border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
    </div>
  ),
});

// Lista dos 52 municípios de Rondônia
const MUNICIPIOS_RO = [
  'Alta Floresta d\'Oeste', 'Alto Alegre dos Parecis', 'Alto Paraíso', 'Alvorada d\'Oeste', 
  'Ariquemes', 'Buritis', 'Cabixi', 'Cacaulândia', 'Cacoal', 'Campo Novo de Rondônia', 
  'Candeias do Jamari', 'Castanheiras', 'Cerejeiras', 'Chupinguaia', 'Colorado do Oeste', 
  'Corumbiara', 'Costa Marques', 'Cujubim', 'Espigão d\'Oeste', 'Governador Jorge Teixeira', 
  'Guajará-Mirim', 'Itapuã do Oeste', 'Jaru', 'Ji-Paraná', 'Machadinho d\'Oeste', 
  'Ministro Andreazza', 'Mirante da Serra', 'Monte Negro', 'Nova Brasilândia d\'Oeste', 
  'Nova Mamoré', 'Nova União', 'Novo Horizonte do Oeste', 'Ouro Preto do Oeste', 'Parecis', 
  'Pimenta Bueno', 'Pimenteiras do Oeste', 'Porto Velho', 'Presidente Médici', 
  'Primavera de Rondônia', 'Rio Crespo', 'Rolim de Moura', 'Santa Luzia d\'Oeste', 
  'Seringueiras', 'São Felipe d\'Oeste', 'São Francisco do Guaporé', 'São Miguel do Guaporé', 
  'Teixeirópolis', 'Theobroma', 'Urupá', 'Vale do Anari', 'Vale do Paraíso', 'Vilhena'
] as const;

interface FaccaoOption {
  id: string;
  nome: string;
  sigla: string | null;
  cor: string | null;
}

interface Pichacao {
  id: string;
  municipio: string;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  descricao: string | null;
  fotos: string[];
  faccaoId: string | null;
  faccao: FaccaoOption | null;
  cadastradoPor: { id: string; name: string; role: string } | null;
  dataRegistro: string;
  createdAt: string;
}

interface PichacoesClientProps {
  userRole: string;
  currentUserId: string;
  currentUserName: string;
}

const EMPTY_FORM = {
  municipio: '',
  endereco: '',
  latitude: '',
  longitude: '',
  faccaoId: '',
  descricao: '',
  fotos: [] as string[],
};

export function PichacoesClient({ userRole, currentUserId, currentUserName }: PichacoesClientProps) {
  const [pichacoes, setPichacoes] = useState<Pichacao[]>([]);
  const [faccoes, setFaccoes] = useState<FaccaoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'GRID' | 'MAP'>('GRID');

  // Filtros
  const [search, setSearch] = useState('');
  const [municipioFilter, setMunicipioFilter] = useState('TODOS');
  const [faccaoFilter, setFaccaoFilter] = useState('TODAS');

  // Modais e Estados do Formulário
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPichacao, setEditingPichacao] = useState<Pichacao | null>(null);
  const [viewerPichacao, setViewerPichacao] = useState<Pichacao | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Confirmação de exclusão
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Carrossel de fotos do visualizador
  const [activeFotoIdx, setActiveFotoIdx] = useState(0);

  const fetchPichacoes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/aip/pichacoes');
      if (res.ok) {
        const data = await res.json();
        setPichacoes(data.pichacoes || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFaccoes = useCallback(async () => {
    try {
      const res = await fetch('/api/sipe/faccoes');
      if (res.ok) {
        const data = await res.json();
        setFaccoes(Array.isArray(data) ? data : data.faccoes || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchPichacoes();
    fetchFaccoes();
  }, [fetchPichacoes, fetchFaccoes]);

  const handleGPSCapture = () => {
    if (!navigator.geolocation) {
      alert('Seu navegador ou aparelho não suporta Geolocalização.');
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm(prev => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setGpsLoading(false);
      },
      (error) => {
        console.error(error);
        alert('Não foi possível obter a sua localização. Verifique as permissões do seu navegador.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/aip/pichacoes/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setForm(prev => ({ ...prev, fotos: [...prev.fotos, data.url] }));
        } else {
          const data = await res.json();
          alert(data.error || 'Falha ao enviar imagem.');
        }
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao processar envio de foto.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.municipio) {
      alert('O município é obrigatório.');
      return;
    }
    if (!form.endereco.trim()) {
      alert('O endereço é obrigatório.');
      return;
    }

    setSaving(true);
    const url = editingPichacao ? `/api/aip/pichacoes/${editingPichacao.id}` : '/api/aip/pichacoes';
    const method = editingPichacao ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setModalOpen(false);
        setEditingPichacao(null);
        setForm(EMPTY_FORM);
        await fetchPichacoes();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao salvar registro de pichação.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar registro de pichação.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/aip/pichacoes/${deleteConfirmId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirmId(null);
        setPichacoes(prev => prev.filter(p => p.id !== deleteConfirmId));
        if (viewerPichacao?.id === deleteConfirmId) {
          setViewerPichacao(null);
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir pichação.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir pichação.');
    } finally {
      setDeleting(false);
    }
  };

  const openNew = () => {
    setEditingPichacao(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (p: Pichacao) => {
    setEditingPichacao(p);
    setForm({
      municipio: p.municipio,
      endereco: p.endereco,
      latitude: p.latitude !== null ? String(p.latitude) : '',
      longitude: p.longitude !== null ? String(p.longitude) : '',
      faccaoId: p.faccaoId || '',
      descricao: p.descricao || '',
      fotos: p.fotos || [],
    });
    setModalOpen(true);
    setViewerPichacao(null);
  };

  const openView = (p: Pichacao) => {
    setViewerPichacao(p);
    setActiveFotoIdx(0);
  };

  const filtered = pichacoes.filter(p => {
    const matchSearch = !search || 
      p.endereco.toLowerCase().includes(search.toLowerCase()) ||
      (p.descricao && p.descricao.toLowerCase().includes(search.toLowerCase())) ||
      (p.faccao?.nome && p.faccao.nome.toLowerCase().includes(search.toLowerCase())) ||
      (p.faccao?.sigla && p.faccao.sigla.toLowerCase().includes(search.toLowerCase()));

    const matchMunicipio = municipioFilter === 'TODOS' || p.municipio === municipioFilter;
    
    let matchFaccao = true;
    if (faccaoFilter !== 'TODAS') {
      if (faccaoFilter === 'SEM_FACCAO') {
        matchFaccao = p.faccaoId === null;
      } else {
        matchFaccao = p.faccaoId === faccaoFilter;
      }
    }

    return matchSearch && matchMunicipio && matchFaccao;
  });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-100 dark:bg-purple-900/40 rounded-xl text-purple-600 dark:text-purple-400">
            <Paintbrush className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pichações e Simbologias</h1>
            <p className="text-xs text-gray-500">Mapeamento territorial de marcas visuais de facções em Rondônia</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50">
            <button
              onClick={() => setViewMode('GRID')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'GRID'
                  ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title="Visualização em Grade"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('MAP')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'MAP'
                  ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title="Visualização no Mapa"
            >
              <Map className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={openNew}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            Registrar Pichação
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por descrição, referência, facção..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
          />
        </div>

        <div>
          <select
            value={municipioFilter}
            onChange={e => setMunicipioFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="TODOS">Todos os Municípios</option>
            {MUNICIPIOS_RO.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={faccaoFilter}
            onChange={e => setFaccaoFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="TODAS">Todas as Facções</option>
            <option value="SEM_FACCAO">Sem Facção Vinculada (Isolada)</option>
            {faccoes.map(f => (
              <option key={f.id} value={f.id}>{f.sigla || f.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="flex-1 min-h-0 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200/50 dark:border-gray-800 p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            <p className="text-sm text-gray-500">Buscando mapeamento visuais...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
            <Paintbrush className="w-12 h-12 stroke-[1.5]" />
            <p className="text-sm font-medium">Nenhuma pichação encontrada para os filtros selecionados</p>
          </div>
        ) : viewMode === 'MAP' ? (
          <div className="w-full h-[550px] relative z-0">
            <PichacoesMap
              pichacoes={filtered}
              onSelect={openView}
            />
          </div>
        ) : (
          /* Grid de Cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto max-h-[calc(100vh-270px)] pr-1">
            {filtered.map(p => {
              const faccaoColor = p.faccao?.cor || '#9ca3af';
              const sigla = p.faccao?.sigla || 'Fato Isolado';
              const mainFoto = p.fotos && p.fotos.length > 0 ? p.fotos[0] : null;

              return (
                <div
                  key={p.id}
                  onClick={() => openView(p)}
                  className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-2xl overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col relative"
                >
                  {/* Foto de Capa */}
                  <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-900 overflow-hidden shrink-0">
                    {mainFoto ? (
                      <img
                        src={mainFoto}
                        alt={`Pichação em ${p.municipio}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1.5">
                        <ImageIcon className="w-8 h-8" />
                        <span className="text-[10px] uppercase font-bold tracking-wider">Sem fotos</span>
                      </div>
                    )}
                    
                    {/* Badge de Facção */}
                    <div className="absolute top-3 left-3 z-10">
                      <span
                        className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm"
                        style={{ backgroundColor: faccaoColor }}
                      >
                        {sigla}
                      </span>
                    </div>
                  </div>

                  {/* Detalhes do Card */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm uppercase tracking-wide truncate">
                        {p.municipio}
                      </h3>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        {p.endereco}
                      </p>
                      {p.descricao && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2.5 line-clamp-2 leading-relaxed italic bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                          "{p.descricao}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(p.dataRegistro).toLocaleDateString('pt-BR')}
                      </span>
                      {p.cadastradoPor && (
                        <span className="truncate max-w-[100px] flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {p.cadastradoPor.name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Cadastro/Edição */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-lg w-full flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Paintbrush className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h2 className="font-bold text-gray-900 dark:text-white text-base">
                  {editingPichacao ? 'Editar Pichação' : 'Registrar Nova Pichação'}
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Município */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1.5">
                  Município *
                </label>
                <select
                  required
                  value={form.municipio}
                  onChange={e => setForm(prev => ({ ...prev, municipio: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Selecione o município...</option>
                  {MUNICIPIOS_RO.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Endereço / Referência */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1.5">
                  Endereço ou Referência Visual *
                </label>
                <input
                  type="text"
                  required
                  value={form.endereco}
                  onChange={e => setForm(prev => ({ ...prev, endereco: e.target.value }))}
                  placeholder="Ex: Muro da Escola X, Esquina da Av. Sete com T-14..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Coordenadas GPS */}
              <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-900 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-800">
                <div className="col-span-2 flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Geolocalização (GPS)
                  </span>
                  <button
                    type="button"
                    onClick={handleGPSCapture}
                    disabled={gpsLoading}
                    className="flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400 font-bold hover:underline disabled:opacity-50"
                  >
                    {gpsLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Compass className="w-3.5 h-3.5 animate-pulse" />
                    )}
                    {gpsLoading ? 'Capturando...' : 'Usar GPS Atual'}
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={form.latitude}
                    onChange={e => setForm(prev => ({ ...prev, latitude: e.target.value }))}
                    placeholder="Ex: -10.923451"
                    className="w-full px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={form.longitude}
                    onChange={e => setForm(prev => ({ ...prev, longitude: e.target.value }))}
                    placeholder="Ex: -62.823451"
                    className="w-full px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Facção */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1.5">
                  Facção Vinculada (Simbologia Identificada)
                </label>
                <select
                  value={form.faccaoId}
                  onChange={e => setForm(prev => ({ ...prev, faccaoId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Sem vínculo / Sigla Isolada</option>
                  {faccoes.map(f => (
                    <option key={f.id} value={f.id}>{f.sigla ? `${f.sigla} - ${f.nome}` : f.nome}</option>
                  ))}
                </select>
              </div>

              {/* Fotos */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-2">
                  Imagens da Pichação (Fotos)
                </label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {uploading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                      ) : (
                        <Upload className="w-5 h-5 text-gray-400" />
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {uploading ? 'Enviando arquivo...' : 'Clique para carregar fotos'}
                      </p>
                      <p className="text-[10px] text-gray-400">JPG, PNG, WebP (Máx: 50MB)</p>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>

              {/* Lista de Fotos Carregadas */}
              {form.fotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 border border-gray-100 dark:border-gray-800 p-2.5 rounded-2xl bg-gray-50 dark:bg-gray-900/50">
                  {form.fotos.map((url, idx) => (
                    <div key={idx} className="relative aspect-video rounded-xl overflow-hidden group border border-gray-200 dark:border-gray-700">
                      <img src={url} alt="upload" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== idx) }))}
                        className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Descrição */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1.5">
                  Conteúdo Escrito / Detalhamento Técnico
                </label>
                <textarea
                  rows={4}
                  value={form.descricao}
                  onChange={e => setForm(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Escreva quais siglas foram desenhadas (ex: 'CV R.O', 'Tudo 2', etc.) e descreva detalhes adicionais relevantes..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 dark:border-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading || !form.municipio || !form.endereco.trim()}
                  className="flex-1 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? 'Registrando...' : 'Confirmar Registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visualizador de Detalhes */}
      {viewerPichacao && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-xl w-full flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Paintbrush className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="font-bold text-gray-900 dark:text-white text-base">Ficha Técnica da Simbologia</h3>
              </div>
              <div className="flex items-center gap-1.5">
                {(userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || viewerPichacao.cadastradoPor?.id === currentUserId) && (
                  <>
                    <button
                      onClick={() => openEdit(viewerPichacao)}
                      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(viewerPichacao.id)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setViewerPichacao(null)}
                  className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Carrossel de Fotos */}
              {viewerPichacao.fotos && viewerPichacao.fotos.length > 0 ? (
                <div className="relative aspect-video bg-gray-900 rounded-2xl overflow-hidden group">
                  <img
                    src={viewerPichacao.fotos[activeFotoIdx]}
                    alt="Foto da pichação"
                    className="w-full h-full object-contain"
                  />
                  
                  {viewerPichacao.fotos.length > 1 && (
                    <>
                      <button
                        onClick={() => setActiveFotoIdx(prev => (prev === 0 ? viewerPichacao.fotos.length - 1 : prev - 1))}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setActiveFotoIdx(prev => (prev === viewerPichacao.fotos.length - 1 ? 0 : prev + 1))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      {/* Paginação */}
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/40 px-2 py-1 rounded-full">
                        {viewerPichacao.fotos.map((_, i) => (
                          <span
                            key={i}
                            className={`w-2 h-2 rounded-full ${
                              i === activeFotoIdx ? 'bg-white' : 'bg-white/40'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="aspect-video bg-gray-100 dark:bg-gray-900/60 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center text-gray-400 gap-1.5">
                  <ImageIcon className="w-10 h-10 stroke-[1.2]" />
                  <span className="text-xs font-bold uppercase tracking-wider">Nenhuma foto registrada</span>
                </div>
              )}

              {/* Detalhes Técnicos */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Territorialidade</span>
                    <h4 className="font-extrabold text-gray-900 dark:text-white text-lg uppercase tracking-wide">
                      {viewerPichacao.municipio} - RO
                    </h4>
                  </div>
                  {viewerPichacao.faccao && (
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Fidelidade Faccionária</span>
                      <div>
                        <span
                          className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full text-white border-0"
                          style={{ backgroundColor: viewerPichacao.faccao.cor || '#6b7280' }}
                        >
                          {viewerPichacao.faccao.sigla || viewerPichacao.faccao.nome}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Endereço / Ponto de Referência</p>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                        {viewerPichacao.endereco}
                      </p>
                    </div>
                  </div>

                  {(viewerPichacao.latitude !== null && viewerPichacao.longitude !== null) && (
                    <div className="flex items-start gap-2.5">
                      <Compass className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-bold">Coordenadas Geográficas</p>
                        <p className="text-sm font-mono text-gray-800 dark:text-gray-200 mt-0.5">
                          {viewerPichacao.latitude.toFixed(6)}, {viewerPichacao.longitude.toFixed(6)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {viewerPichacao.descricao && (
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-1">
                      Conteúdo / Relatório Técnico
                    </span>
                    <div className="text-sm text-gray-700 dark:text-gray-200 bg-purple-50/40 dark:bg-purple-900/10 border border-purple-100/50 dark:border-purple-900/30 p-4 rounded-2xl whitespace-pre-wrap leading-relaxed text-justify">
                      {viewerPichacao.descricao}
                    </div>
                  </div>
                )}

                {/* Rodapé da Ficha */}
                <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-4">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-purple-500/80" />
                    Registrado em: {new Date(viewerPichacao.dataRegistro).toLocaleString('pt-BR')}
                  </span>
                  {viewerPichacao.cadastradoPor && (
                    <span className="flex items-center gap-1">
                      <User className="w-4 h-4 text-purple-500/80" />
                      Por: {viewerPichacao.cadastradoPor.name} ({viewerPichacao.cadastradoPor.role === 'SUPER_ADMIN' ? 'Super Admin' : viewerPichacao.cadastradoPor.role === 'ADMIN' ? 'Administrador' : 'Operador'})
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-red-100 dark:bg-red-900/30 rounded-full">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white">Excluir Registro?</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
              Esta ação é irreversível. A ficha e todas as fotos correspondentes serão deletadas permanentemente do servidor.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deletando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
