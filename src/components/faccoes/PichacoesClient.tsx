'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Paintbrush, Plus, Eye, Pencil, Trash2, Search, X, Check, Loader2,
  MapPin, Grid, Map, Image as ImageIcon, Calendar, User, Compass,
  ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Upload,
  Target, Flame, EyeOff, SlidersHorizontal, Download, BarChart3
} from 'lucide-react';
import {
  getValidGeoPichacoes,
  groupPichacoesByFaccao,
  detectTerritoryConflicts,
  aggregateByMunicipio,
} from './pichacoes-territory-utils';

const PichacoesMap = dynamic(() => import('./PichacoesMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] rounded-2xl border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
    </div>
  ),
});

const PichacoesTerritoryMap = dynamic(() => import('./PichacoesTerritoryMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[550px] rounded-2xl border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
        <span className="text-xs text-gray-500">Calculando zonas de influência e conflitos...</span>
      </div>
    </div>
  ),
});

const PichacaoGeoPickerMap = dynamic(() => import('./PichacaoGeoPickerMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-44 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
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
  const [viewMode, setViewMode] = useState<'GRID' | 'MAP' | 'TERRITORY'>('GRID');

  // Territory / Heatmap visualization controls (only used in TERRITORY mode)
  const [influenceRadius, setInfluenceRadius] = useState(450); // meters - smaller default for better urban readability
  const [conflictThreshold, setConflictThreshold] = useState(1200); // meters
  const [refitVersion, setRefitVersion] = useState(0); // used to manually trigger fit to data from sidebar
  const [showPoints, setShowPoints] = useState(true);
  const [showInfluenceZones, setShowInfluenceZones] = useState(true);
  const [showConflicts, setShowConflicts] = useState(true);
  const [hiddenFaccaoIds, setHiddenFaccaoIds] = useState<Set<string>>(() => new Set<string>());

  // Filtros
  const [search, setSearch] = useState('');
  const [municipioFilter, setMunicipioFilter] = useState('TODOS');
  const [faccaoFilter, setFaccaoFilter] = useState('TODAS');

  // Memoized filtered list (moved up so territory visibility useMemo can depend on it)
  const filtered = useMemo(() => {
    return pichacoes.filter((p) => {
      const matchSearch =
        !search ||
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
  }, [pichacoes, search, municipioFilter, faccaoFilter]);

  // Full live territory analysis (used by sidebar stats, visibility chips, and export)
  const territoryAnalysis = useMemo(() => {
    const validRaw = getValidGeoPichacoes(filtered);
    // Map to the shape expected by the pure utils
    const valid = validRaw.map((p: any) => ({
      id: p.id,
      municipio: p.municipio,
      endereco: p.endereco,
      latitude: p.latitude,
      longitude: p.longitude,
      descricao: p.descricao,
      faccaoId: p.faccaoId,
      faccao: p.faccao,
    }));

    const groups = groupPichacoesByFaccao(valid, hiddenFaccaoIds);
    const conflicts = detectTerritoryConflicts(valid, conflictThreshold, hiddenFaccaoIds);
    const byMunicipio = aggregateByMunicipio(valid as any);

    const totalGeoMarks = valid.length;
    const activeFaccoes = groups.length;

    return {
      totalGeoMarks,
      groups,
      conflicts,
      byMunicipio,
      activeFaccoes,
      conflictCount: conflicts.length,
    };
  }, [filtered, hiddenFaccaoIds, conflictThreshold]);

  // For the chips (re-uses the groups from analysis but without hidden applied for display choices)
  const territoryFaccaoVisibility = useMemo(() => {
    // Show all present even if currently hidden so user can re-enable them
    const validRaw = getValidGeoPichacoes(filtered);
    const valid = validRaw.map((p: any) => ({
      id: p.id,
      municipio: p.municipio,
      endereco: p.endereco,
      latitude: p.latitude,
      longitude: p.longitude,
      descricao: p.descricao,
      faccaoId: p.faccaoId,
      faccao: p.faccao,
    }));
    const allGroups = groupPichacoesByFaccao(valid, new Set<string>()); // ignore hidden for the toggle list
    return allGroups.map((g) => ({
      key: g.key,
      label: g.label,
      cor: g.cor,
      count: g.count,
    }));
  }, [filtered]);

  // Modais e Estados do Formulário
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPichacao, setEditingPichacao] = useState<Pichacao | null>(null);
  const [viewerPichacao, setViewerPichacao] = useState<Pichacao | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [rotatingIdx, setRotatingIdx] = useState<number | null>(null);

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

  const handleRotatePhoto = async (url: string, index: number) => {
    setRotatingIdx(index);
    try {
      const res = await fetch('/api/aip/pichacoes/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, direction: 'cw' }),
      });

      if (res.ok) {
        const data = await res.json();
        setForm(prev => {
          const nextFotos = [...prev.fotos];
          nextFotos[index] = data.url;
          return { ...prev, fotos: nextFotos };
        });
      } else {
        const data = await res.json();
        alert(data.error || 'Falha ao rotacionar imagem.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao processar rotação da foto.');
    } finally {
      setRotatingIdx(null);
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

    // Remove parâmetros de cache-busting (?t=...) antes de enviar para salvar no banco
    const cleanedFotos = form.fotos.map(f => f.split('?')[0]);
    const payload = {
      ...form,
      fotos: cleanedFotos,
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  // ==================== EXPORT FUNCTIONS (Territory Analysis) ====================
  const buildAnalysisPayload = () => {
    const now = new Date().toISOString();
    const appliedFilters = {
      search: search || null,
      municipio: municipioFilter,
      faccao: faccaoFilter,
    };

    return {
      generatedAt: now,
      source: 'Pichações e Simbologias - Modo Território',
      appliedFilters,
      parameters: {
        influenceRadiusMeters: influenceRadius,
        conflictThresholdMeters: conflictThreshold,
        hiddenFaccaoIds: Array.from(hiddenFaccaoIds),
      },
      summary: {
        totalGeoMarks: territoryAnalysis.totalGeoMarks,
        activeFaccoes: territoryAnalysis.activeFaccoes,
        conflictCount: territoryAnalysis.conflictCount,
      },
      faccoes: territoryAnalysis.groups.map((g) => ({
        key: g.key,
        label: g.label,
        cor: g.cor,
        count: g.count,
        percentage:
          territoryAnalysis.totalGeoMarks > 0
            ? Number(((g.count / territoryAnalysis.totalGeoMarks) * 100).toFixed(1))
            : 0,
      })),
      conflicts: territoryAnalysis.conflicts.map((c) => ({
        faccaoA: c.faccaoA,
        faccaoB: c.faccaoB,
        distanceMeters: c.distance,
        lat: c.lat,
        lng: c.lng,
        municipioA: c.municipioA,
        municipioB: c.municipioB,
      })),
      topMunicipios: territoryAnalysis.byMunicipio.slice(0, 10),
    };
  };

  const exportTerritoryAnalysis = () => {
    try {
      const payload = buildAnalysisPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `analise-territorial-pichacoes-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar exportação.');
    }
  };

  const exportConflictsCSV = () => {
    if (territoryAnalysis.conflictCount === 0) return;

    try {
      const header = 'faccao_a,faccao_b,distancia_metros,latitude,longitude,municipio_a,municipio_b\n';
      const rows = territoryAnalysis.conflicts
        .map((c) =>
          [
            `"${c.faccaoA.replace(/"/g, '""')}"`,
            `"${c.faccaoB.replace(/"/g, '""')}"`,
            c.distance,
            c.lat,
            c.lng,
            `"${(c.municipioA || '').replace(/"/g, '""')}"`,
            `"${(c.municipioB || '').replace(/"/g, '""')}"`,
          ].join(',')
        )
        .join('\n');

      const csv = header + rows;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `conflitos-territoriais-pichacoes-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar CSV de conflitos.');
    }
  };

  // filtered is now declared earlier as useMemo (for ordering with territory visibility)

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
              title="Mapa de Pontos (básico)"
            >
              <Map className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('TERRITORY')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'TERRITORY'
                  ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title="Análise de Território, Calor e Conflitos (opcional)"
            >
              <Target className="w-4 h-4" />
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
        ) : viewMode === 'TERRITORY' ? (
          <div className="flex flex-col gap-3">
            {/* Territory controls - full width */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-3 text-sm">
              <div className="flex items-center gap-2 mb-3 text-purple-600 dark:text-purple-400">
                <Target className="w-4 h-4" />
                <span className="font-bold text-xs uppercase tracking-widest">Análise de Território e Conflitos</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {/* Influence radius */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <label className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5" /> Raio de influência (cobertura)
                    </label>
                    <span className="tabular-nums font-mono text-purple-600">{(influenceRadius / 1000).toFixed(1)} km</span>
                  </div>
                  <input
                    type="range"
                    min={200}
                    max={4000}
                    step={100}
                    value={influenceRadius}
                    onChange={(e) => setInfluenceRadius(parseInt(e.target.value))}
                    className="w-full accent-purple-600"
                  />
                  <div className="text-[10px] text-gray-500">Zonas ao redor de cada marca registrada (análoga a área de sinal)</div>
                </div>

                {/* Conflict threshold */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <label className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> Distância para conflito
                    </label>
                    <span className="tabular-nums font-mono text-red-600">{(conflictThreshold / 1000).toFixed(1)} km</span>
                  </div>
                  <input
                    type="range"
                    min={300}
                    max={5000}
                    step={100}
                    value={conflictThreshold}
                    onChange={(e) => setConflictThreshold(parseInt(e.target.value))}
                    className="w-full accent-red-600"
                  />
                  <div className="text-[10px] text-gray-500">Marcas de facções diferentes mais próximas que isso = zona de disputa</div>
                </div>

                {/* Layer toggles */}
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <button
                    type="button"
                    onClick={() => setShowPoints(!showPoints)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition ${showPoints ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 text-purple-700 dark:text-purple-300' : 'border-gray-300 text-gray-500'}`}
                  >
                    {showPoints ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} Pontos
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInfluenceZones(!showInfluenceZones)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition ${showInfluenceZones ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 text-purple-700 dark:text-purple-300' : 'border-gray-300 text-gray-500'}`}
                  >
                    {showInfluenceZones ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} Zonas de influência
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConflicts(!showConflicts)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition ${showConflicts ? 'bg-red-100 dark:bg-red-900/30 border-red-300 text-red-700 dark:text-red-300' : 'border-gray-300 text-gray-500'}`}
                  >
                    {showConflicts ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} Conflitos / Disputas
                  </button>

                  <div className="ml-auto text-[10px] text-gray-400 self-center flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3" /> Ajustes ao vivo — não altera os dados
                  </div>

                  <button
                    type="button"
                    onClick={() => setRefitVersion(v => v + 1)}
                    className="text-[10px] px-2.5 py-1 rounded-lg border border-purple-300 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center gap-1"
                    title="Centralizar e ajustar zoom automaticamente nos pontos atuais"
                  >
                    Ajustar visão aos eventos
                  </button>
                </div>
              </div>

              {/* Facção visibility chips */}
              {territoryFaccaoVisibility.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-1.5">Alternar visibilidade por facção</div>
                  <div className="flex flex-wrap gap-1.5">
                    {territoryFaccaoVisibility.map(({ key, label, cor, count }: { key: string; label: string; cor: string; count: number }) => {
                      const isHidden = hiddenFaccaoIds.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            setHiddenFaccaoIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }}
                          className={`text-[10px] px-2.5 py-0.5 rounded-full border flex items-center gap-1 transition ${isHidden ? 'line-through opacity-50 border-gray-300' : 'border-gray-300'}`}
                          style={{ backgroundColor: isHidden ? undefined : cor + '22' }}
                          title={isHidden ? 'Mostrar esta facção' : 'Ocultar esta facção no mapa'}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cor }} />
                          {label} <span className="font-mono opacity-60">({count})</span>
                          {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      );
                    })}
                    {hiddenFaccaoIds.size > 0 && (
                      <button
                        onClick={() => setHiddenFaccaoIds(new Set<string>())}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-gray-300 hover:bg-gray-100 text-gray-500"
                      >
                        Mostrar todas
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Map + Lateral Stats Panel */}
            <div className="flex flex-col lg:flex-row gap-3 min-h-[520px]">
              {/* Map */}
              <div className="flex-1 min-h-[420px] lg:min-h-0 relative z-0 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <PichacoesTerritoryMap
                  pichacoes={filtered}
                  onSelect={openView}
                  influenceRadius={influenceRadius}
                  conflictThreshold={conflictThreshold}
                  showPoints={showPoints}
                  showInfluenceZones={showInfluenceZones}
                  showConflicts={showConflicts}
                  hiddenFaccaoIds={hiddenFaccaoIds}
                  refitVersion={refitVersion}
                />
              </div>

              {/* Lateral Statistical Summary + Export */}
              <aside className="w-full lg:w-80 shrink-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex flex-col text-sm max-h-[520px] overflow-auto">
                <div className="flex items-center gap-2 mb-3 text-purple-600 dark:text-purple-400">
                  <BarChart3 className="w-4 h-4" />
                  <span className="font-bold text-xs uppercase tracking-widest">Resumo Estatístico</span>
                </div>

                {/* Quick numbers */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-2 text-center">
                    <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                      {territoryAnalysis.totalGeoMarks}
                    </div>
                    <div className="text-[9px] text-gray-500 leading-tight">Marcas<br />georreferenciadas</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-2 text-center">
                    <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                      {territoryAnalysis.activeFaccoes}
                    </div>
                    <div className="text-[9px] text-gray-500 leading-tight">Facções<br />ativas</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-2 text-center border border-red-200 dark:border-red-900/50">
                    <div className="text-lg font-bold text-red-600 tabular-nums">
                      {territoryAnalysis.conflictCount}
                    </div>
                    <div className="text-[9px] text-red-600/80 leading-tight">Zonas de<br />conflito</div>
                  </div>
                </div>

                {/* Per Facção */}
                <div className="mb-3">
                  <div className="font-semibold text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Por facção</div>
                  {territoryAnalysis.groups.length === 0 ? (
                    <div className="text-xs text-gray-500">Nenhuma facção com coordenadas</div>
                  ) : (
                    <div className="space-y-1">
                      {territoryAnalysis.groups.slice(0, 6).map((g) => (
                        <div key={g.key} className="flex items-center gap-2 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.cor }} />
                          <span className="truncate flex-1 text-gray-800 dark:text-gray-200">{g.label}</span>
                          <span className="font-mono tabular-nums text-gray-600 dark:text-gray-400">{g.count}</span>
                          <span className="text-[10px] text-gray-400 w-8 text-right">
                            {territoryAnalysis.totalGeoMarks > 0
                              ? Math.round((g.count / territoryAnalysis.totalGeoMarks) * 100)
                              : 0}%
                          </span>
                        </div>
                      ))}
                      {territoryAnalysis.groups.length > 6 && (
                        <div className="text-[10px] text-gray-400 pl-5">+{territoryAnalysis.groups.length - 6} outras</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Conflitos */}
                {territoryAnalysis.conflictCount > 0 && (
                  <div className="mb-3">
                    <div className="font-semibold text-[10px] uppercase tracking-wider text-red-600 mb-1">Conflitos detectados</div>
                    <div className="space-y-1 text-xs max-h-[92px] overflow-auto pr-1">
                      {territoryAnalysis.conflicts.slice(0, 5).map((c, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[10px] bg-red-50 dark:bg-red-950/30 rounded px-2 py-0.5">
                          <span className="truncate">
                            <span style={{ color: c.corA }} className="font-medium">{c.faccaoA}</span>
                            <span className="mx-1 text-gray-400">×</span>
                            <span style={{ color: c.corB }} className="font-medium">{c.faccaoB}</span>
                          </span>
                          <span className="font-mono text-red-600/80 shrink-0 pl-2">{c.distance}m</span>
                        </div>
                      ))}
                      {territoryAnalysis.conflictCount > 5 && (
                        <div className="text-[10px] text-red-500 pl-1">+{territoryAnalysis.conflictCount - 5} outros conflitos</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Top municípios */}
                {territoryAnalysis.byMunicipio.length > 0 && (
                  <div className="mb-4">
                    <div className="font-semibold text-[10px] uppercase tracking-wider text-gray-500 mb-1">Top municípios</div>
                    <div className="text-xs space-y-0.5">
                      {territoryAnalysis.byMunicipio.slice(0, 3).map((m, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="truncate pr-2">{m.municipio}</span>
                          <span className="font-mono text-gray-500">{m.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Export */}
                <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => exportTerritoryAnalysis()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Exportar Análise Atual (JSON)
                  </button>
                  <button
                    onClick={() => exportConflictsCSV()}
                    disabled={territoryAnalysis.conflictCount === 0}
                    className="w-full mt-1.5 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
                  >
                    Exportar Conflitos (CSV)
                  </button>
                  <p className="text-[9px] text-gray-400 mt-1.5 text-center">
                    Inclui filtros aplicados + parâmetros + dados calculados
                  </p>
                </div>
              </aside>
            </div>
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

                {/* Mapa para selecionar/ajustar localização com marcador arrastável */}
                <div className="col-span-2 h-44 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 relative z-0">
                  <PichacaoGeoPickerMap
                    latitude={form.latitude ? parseFloat(form.latitude) : null}
                    longitude={form.longitude ? parseFloat(form.longitude) : null}
                    onPick={(lat, lng) => setForm(prev => ({
                      ...prev,
                      latitude: lat.toFixed(6),
                      longitude: lng.toFixed(6),
                    }))}
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
                      
                      {/* Botoes de Acao (aparece no hover) */}
                      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRotatePhoto(url, idx)}
                          disabled={rotatingIdx === idx}
                          className="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                          title="Rotacionar 90° Horário"
                        >
                          {rotatingIdx === idx ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== idx) }))}
                          className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          title="Remover Foto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
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
