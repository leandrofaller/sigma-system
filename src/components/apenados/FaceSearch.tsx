'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useIndexing } from '@/contexts/IndexingContext';
import {
  X, ScanFace, Upload, Loader2, AlertTriangle, RefreshCw,
  Database, Search, CheckCircle, Trash2, Users, ZoomIn, ZoomOut, Pencil,
  ShieldAlert, Activity, Clock, Percent, ShieldCheck, History, Info
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FaceMatch {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
  similarity: number;
}

interface DetectedFace {
  index: number;
  det_score: number;
  bbox: number[];   // [x1, y1, x2, y2] em pixels da imagem original
  kps: number[][];
  matches: FaceMatch[];
  liveness_score?: number | null;
}

interface SearchResult {
  faces: DetectedFace[];
  imageWidth: number;
  imageHeight: number;
  indexed: number;
}

interface IndexStatus {
  total: number;
  indexed: number;
  withPhoto: number;
  noFace: number;
  remaining: number;
}

type Tab = 'search' | 'index' | 'advanced' | 'no-face';
type SearchState = 'ready' | 'analyzing' | 'results' | 'no-face' | 'error';

const BATCH_SIZE = 30;   // IDs por requisição de indexação

// ─── Helpers ─────────────────────────────────────────────────────────────────

function simColor(s: number) {
  if (s >= 70) return 'text-green-600 dark:text-green-400';
  if (s >= 45) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-500 dark:text-red-400';
}

function simBg(s: number) {
  if (s >= 70) return 'bg-green-500';
  if (s >= 45) return 'bg-yellow-400';
  return 'bg-red-400';
}

function simLabel(s: number) {
  if (s >= 85) return 'Muito alta';
  if (s >= 70) return 'Alta';
  if (s >= 55) return 'Moderada';
  if (s >= 40) return 'Baixa';
  return 'Muito baixa';
}

function fmtTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

function MatchCard({ match, rank, onEdit, onViewPhoto }: { match: FaceMatch; rank: number; onEdit?: (id: string) => void; onViewPhoto?: (match: FaceMatch) => void }) {
  return (
    <div className={`rounded-xl border overflow-hidden ${
      match.similarity >= 70 ? 'border-green-200 dark:border-green-800'
      : match.similarity >= 45 ? 'border-yellow-200 dark:border-yellow-800'
      : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-center gap-3 p-3 bg-gray-50/60 dark:bg-gray-800/50">
        <span className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-subtle flex-shrink-0">
          {rank}
        </span>
        <div
          onClick={() => onViewPhoto?.(match)}
          title="Clique para ampliar a foto"
          className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700 cursor-pointer hover:opacity-80 transition-opacity"
        >
          {match.photoPath ? (
            <img src={`/api/apenados/${match.id}/foto`} alt={match.name} loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><ScanFace className="w-5 h-5 text-gray-400" /></div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-title truncate">{match.name}</p>
          <p className="text-xs text-subtle truncate">
            {[match.matricula, match.unidade].filter(Boolean).join(' · ') || 'Sem matrícula'}
          </p>
          {match.faccao && <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium mt-0.5">{match.faccao}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex flex-col items-end gap-0.5">
            <span className={`text-xl font-black tabular-nums ${simColor(match.similarity)}`}>{match.similarity}%</span>
            <span className={`text-[10px] font-semibold ${simColor(match.similarity)}`}>{simLabel(match.similarity)}</span>
          </div>
          {onEdit && (
            <button
              onClick={() => onEdit(match.id)}
              title="Editar registro"
              className="flex items-center gap-1 text-[10px] font-medium text-sigma-600 hover:text-sigma-700 bg-sigma-50 dark:bg-sigma-900/30 hover:bg-sigma-100 dark:hover:bg-sigma-900/50 px-2 py-0.5 rounded-lg transition-colors"
            >
              <Pencil className="w-2.5 h-2.5" /> Editar
            </button>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800">
        <div className={`h-full transition-all ${simBg(match.similarity)}`} style={{ width: `${match.similarity}%` }} />
      </div>
    </div>
  );
}

// ─── FaceCanvas: desenha bboxes na imagem ─────────────────────────────────────

function FaceCanvas({
  imageUrl,
  faces,
  selectedIdx,
  imageWidth,
  imageHeight,
  onSelectFace,
  displayHeight,
}: {
  imageUrl: string;
  faces: DetectedFace[];
  selectedIdx: number;
  imageWidth: number;
  imageHeight: number;
  onSelectFace: (idx: number) => void;
  displayHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.naturalWidth) return;

    const scaleX = img.clientWidth / imageWidth;
    const scaleY = img.clientHeight / imageHeight;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    faces.forEach((face, i) => {
      const [x1, y1, x2, y2] = face.bbox;
      const dx = x1 * scaleX;
      const dy = y1 * scaleY;
      const dw = (x2 - x1) * scaleX;
      const dh = (y2 - y1) * scaleY;
      const isSelected = face.index === selectedIdx;

      ctx.strokeStyle = isSelected ? '#4f8cff' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.strokeRect(dx, dy, dw, dh);

      ctx.fillStyle = isSelected ? '#4f8cff' : 'rgba(100,100,100,0.7)';
      ctx.fillRect(dx, dy - 20, 40, 18);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`#${i + 1}`, dx + 4, dy - 6);
    });
  }, [faces, selectedIdx, imageWidth, imageHeight, displayHeight]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) draw();
    else img.addEventListener('load', draw);
    return () => img.removeEventListener('load', draw);
  }, [draw]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800" style={{ maxHeight: `${displayHeight}px` }}>
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Foto analisada"
        className="w-full object-contain"
        style={{ maxHeight: `${displayHeight}px`, display: 'block' }}
        onLoad={draw}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: faces.length > 1 ? 'auto' : 'none', cursor: faces.length > 1 ? 'pointer' : 'default' }}
        onClick={(e) => {
          if (faces.length <= 1 || !imgRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const px = (e.clientX - rect.left) / (imgRef.current.clientWidth / imageWidth);
          const py = (e.clientY - rect.top) / (imgRef.current.clientHeight / imageHeight);
          for (const face of faces) {
            const [x1, y1, x2, y2] = face.bbox;
            if (px >= x1 && px <= x2 && py >= y1 && py <= y2) {
              onSelectFace(face.index);
              break;
            }
          }
        }}
      />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props { onClose: () => void; userRole: string; onEditApenado?: (id: string) => void }

export function FaceSearch({ onClose, userRole, onEditApenado }: Props) {
  const [tab, setTab] = useState<Tab>('search');

  // Visualizar foto ampliada
  const [viewingPhotoMatch, setViewingPhotoMatch] = useState<FaceMatch | null>(null);

  // Search
  const [searchState, setSearchState] = useState<SearchState>('ready');
  const [errorMsg, setErrorMsg] = useState('');
  const [analyzeMsg, setAnalyzeMsg] = useState('Analisando rosto no servidor...');
  const [queryURL, setQueryURL] = useState<string | null>(null);
  const [queryFile, setQueryFile] = useState<File | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selectedFaceIdx, setSelectedFaceIdx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [minSimilarity, setMinSimilarity] = useState(30);
  const [faceDisplayHeight, setFaceDisplayHeight] = useState(380);

  // IA Facial Avançada States
  const [advSearchState, setAdvSearchState] = useState<'ready' | 'analyzing' | 'results' | 'error' | 'spoof' | 'low-quality'>('ready');
  const [advQueryURL, setAdvQueryURL] = useState<string | null>(null);
  const [advQueryFile, setAdvQueryFile] = useState<File | null>(null);
  const [advResult, setAdvResult] = useState<any | null>(null);
  const [advErrorMsg, setAdvErrorMsg] = useState('');
  const [advLivenessScore, setAdvLivenessScore] = useState<number | null>(null);
  const [advQuality, setAdvQuality] = useState<any | null>(null);
  const [advSelectedFaceIdx, setAdvSelectedFaceIdx] = useState(0);
  const [advMinSimilarity, setAdvMinSimilarity] = useState(55); // Inicial recomendado 55%
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [advIndexStatus, setAdvIndexStatus] = useState<any | null>(null);
  const [isAdvIndexing, setIsAdvIndexing] = useState(false);
  const [advIndexProgress, setAdvIndexProgress] = useState<any>({ current: 0, total: 0, faces: 0, skipped: 0, errors: 0 });

  // Sem Rosto
  const [noFaceType, setNoFaceType] = useState<'advanced' | 'classic'>('advanced');
  const [noFacePage, setNoFacePage] = useState(1);
  const [noFaceData, setNoFaceData] = useState<any | null>(null);
  const [noFaceLoading, setNoFaceLoading] = useState(false);
  const [selectedNoFaceIds, setSelectedNoFaceIds] = useState<string[]>([]);

  // Index
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showAdvancedClearConfirm, setShowAdvancedClearConfirm] = useState(false);
  const { isIndexing, progress: indexProgress, indexError, startIndexing, stopIndexing } = useIndexing();

  const fetchDashboard = useCallback(async () => {
    try { setDashboard(await (await fetch('/api/apenados/face/advanced-dashboard')).json()); } catch {}
  }, []);

  const fetchAdvStatus = useCallback(async () => {
    try {
      const data = await (await fetch('/api/apenados/face/advanced-status')).json();
      setAdvIndexStatus(data);
      if (data.job) {
        setIsAdvIndexing(data.job.isRunning);
        setAdvIndexProgress(data.job.progress);
      }
    } catch {}
  }, []);

  // Polling para o job de indexação avançada
  useEffect(() => {
    fetchDashboard();
    fetchAdvStatus();
  }, [fetchDashboard, fetchAdvStatus]);

  useEffect(() => {
    let interval: any = null;
    if (isAdvIndexing) {
      interval = setInterval(() => {
        fetchAdvStatus();
        fetchDashboard();
      }, 2000);
    } else {
      fetchDashboard();
      fetchAdvStatus();
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isAdvIndexing, fetchAdvStatus, fetchDashboard]);

  const fetchNoFaceData = useCallback(async (type: 'classic' | 'advanced', page: number) => {
    setNoFaceLoading(true);
    try {
      const res = await fetch(`/api/apenados/face/no-face?type=${type}&page=${page}&limit=12`);
      const data = await res.json();
      if (res.ok) setNoFaceData(data);
    } catch {}
    setNoFaceLoading(false);
  }, []);

  useEffect(() => {
    setSelectedNoFaceIds([]);
    if (tab === 'no-face') {
      fetchNoFaceData(noFaceType, noFacePage);
    }
  }, [tab, noFaceType, noFacePage, fetchNoFaceData]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancela retry pendente ao desmontar
  useEffect(() => () => { if (retryRef.current) clearTimeout(retryRef.current); }, []);

  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';
  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  const fetchStatus = async () => {
    try { setIndexStatus(await (await fetch('/api/apenados/face/status')).json()); } catch {}
  };

  useEffect(() => { fetchStatus(); }, []);

  // Atualiza contadores quando a indexação terminar
  useEffect(() => { if (!isIndexing) fetchStatus(); }, [isIndexing]);

  // ── Analisar foto no servidor ─────────────────────────────────────────────
  const analyzeImage = useCallback(async (file: File, minSim: number) => {
    setSearchState('analyzing');
    setAnalyzeMsg('Analisando rosto no servidor...');
    setErrorMsg('');
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }

    // Após 6s sem resposta, avisa que o índice pode estar sendo carregado pela 1ª vez
    const slowTimer = setTimeout(
      () => setAnalyzeMsg('Carregando índice de embeddings (primeira vez após reinício)...'),
      6000,
    );

    try {
      const form = new FormData();
      form.append('image', file);
      form.append('topN', '20');
      form.append('minSimilarity', String(minSim));

      const res = await fetch('/api/apenados/face/search', { method: 'POST', body: form });

      // Resposta pode ser "Bad Gateway" (texto não-JSON) se Traefik interceptar
      const text = await res.text();
      let data: SearchResult & { error?: string } | null = null;
      try { data = JSON.parse(text); } catch {
        throw new Error(`Erro de gateway: ${text.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);

      if (!data!.faces || data!.faces.length === 0) {
        setResult(data!);
        setSearchState('no-face');
        return;
      }

      setResult(data!);
      setSelectedFaceIdx(data!.faces[0].index);
      setSearchState('results');
    } catch (err: any) {
      const msg: string = err.message || 'Erro no reconhecimento facial.';
      // Cache ainda carregando: retry automático em 4s (cache costuma terminar neste intervalo)
      if (msg.includes('ainda carregando')) {
        setAnalyzeMsg('Índice quase pronto, tentando novamente...');
        retryRef.current = setTimeout(() => analyzeImage(file, minSim), 4000);
        return;
      }
      setErrorMsg(msg);
      setSearchState('error');
    } finally {
      clearTimeout(slowTimer);
    }
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setQueryURL(url);
    setQueryFile(file);
    setResult(null);
    setErrorMsg('');
    analyzeImage(file, minSimilarity);
  }, [analyzeImage, minSimilarity]);

  const reanalyze = useCallback(() => {
    if (queryFile) analyzeImage(queryFile, minSimilarity);
  }, [queryFile, analyzeImage, minSimilarity]);

  const reset = () => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    setSearchState('ready');
    setQueryURL(null);
    setQueryFile(null);
    setResult(null);
    setErrorMsg('');
    setAnalyzeMsg('Analisando rosto no servidor...');
  };

  // ── IA Facial Avançada ────────────────────────────────────────────────────
  const analyzeImageAdvanced = useCallback(async (file: File, minSim: number) => {
    setAdvSearchState('analyzing');
    setAdvErrorMsg('');
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('topN', '20');
      form.append('minSimilarity', String(minSim));
      form.append('compare', 'true'); // ativa comparação com ArcFace

      const res = await fetch('/api/apenados/face/advanced-search', { method: 'POST', body: form });
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch {
        throw new Error(`Erro na API: ${text.slice(0, 120)}`);
      }

      if (res.status === 422) {
        if (data.livenessBlocked) {
          setAdvLivenessScore(data.liveness_score);
          setAdvQuality(data.quality);
          setAdvSearchState('spoof');
          fetchDashboard();
          return;
        }
        if (data.qualityRejected) {
          setAdvQuality(data.quality);
          setAdvLivenessScore(data.liveness_score);
          setAdvSearchState('low-quality');
          fetchDashboard();
          return;
        }
      }

      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);

      if (!data!.faces || data!.faces.length === 0) {
        setAdvResult(data!);
        setAdvSearchState('ready'); // no face detectado
        return;
      }

      setAdvResult(data!);
      setAdvLivenessScore(data.faces[0].liveness_score);
      setAdvQuality(data.faces[0].quality);
      setAdvSelectedFaceIdx(data!.faces[0].index);
      setAdvSearchState('results');
      fetchDashboard();
    } catch (err: any) {
      setAdvErrorMsg(err.message || 'Erro no processamento da busca facial avançada.');
      setAdvSearchState('error');
    }
  }, [fetchDashboard]);

  const handleAdvFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setAdvQueryURL(url);
    setAdvQueryFile(file);
    setAdvResult(null);
    setAdvErrorMsg('');
    analyzeImageAdvanced(file, advMinSimilarity);
  }, [analyzeImageAdvanced, advMinSimilarity]);

  const reanalyzeAdvanced = useCallback(() => {
    if (advQueryFile) analyzeImageAdvanced(advQueryFile, advMinSimilarity);
  }, [advQueryFile, analyzeImageAdvanced, advMinSimilarity]);

  const resetAdvanced = () => {
    setAdvSearchState('ready');
    setAdvQueryURL(null);
    setAdvQueryFile(null);
    setAdvResult(null);
    setAdvErrorMsg('');
  };

  const startAdvIndexing = async () => {
    try {
      await fetch('/api/apenados/face/advanced-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      setIsAdvIndexing(true);
      fetchAdvStatus();
    } catch {}
  };

  const stopAdvIndexing = async () => {
    try {
      await fetch('/api/apenados/face/advanced-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      setIsAdvIndexing(false);
      fetchAdvStatus();
    } catch {}
  };

  const clearIndex = async () => {
    setShowClearConfirm(false);
    try {
      const res = await fetch('/api/apenados/face/clear', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) fetchStatus();
      else setErrorMsg(data.error || 'Erro ao limpar índice');
    } catch { setErrorMsg('Erro ao limpar índice'); }
  };

  const clearAdvancedIndex = async () => {
    setShowAdvancedClearConfirm(false);
    try {
      const res = await fetch('/api/apenados/face/advanced-clear', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        fetchAdvStatus();
        fetchDashboard();
      } else {
        setAdvErrorMsg(data.error || 'Erro ao reiniciar indexação avançada');
        setAdvSearchState('error');
      }
    } catch {
      setAdvErrorMsg('Erro ao reiniciar indexação avançada');
      setAdvSearchState('error');
    }
  };

  const handleReindex = async (targetId?: string) => {
    try {
      const body: any = { type: noFaceType };
      if (targetId) {
        body.id = targetId;
      } else if (selectedNoFaceIds.length > 0) {
        body.ids = selectedNoFaceIds;
      }

      const res = await fetch('/api/apenados/face/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        setSelectedNoFaceIds([]);
        fetchNoFaceData(noFaceType, noFacePage);
        fetchAdvStatus();
        fetchDashboard();
        fetchStatus();
      } else {
        setAdvErrorMsg(data.error || 'Erro ao reindexar registros');
        setAdvSearchState('error');
      }
    } catch {
      setAdvErrorMsg('Erro ao reindexar registros');
      setAdvSearchState('error');
    }
  };

  const etaSeconds = (() => {
    const { current, total, startTime } = indexProgress;
    if (!startTime || !current) return Infinity;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = current / elapsed;
    return (total - current) / rate;
  })();

  const selectedFace = result?.faces.find(f => f.index === selectedFaceIdx);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="gradient-sigma px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <ScanFace className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Reconhecimento Facial — ArcFace</p>
              <p className="text-white/70 text-xs">
                {indexStatus
                  ? `${indexStatus.indexed.toLocaleString('pt-BR')} / ${indexStatus.withPhoto.toLocaleString('pt-BR')} fotos indexadas · 512 dims`
                  : 'Carregando status...'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          {([
            ['search', Search, 'Busca Clássica (ArcFace)'],
            ['advanced', ScanFace, 'IA Facial (Avançado)'],
            ...(isAdmin ? [
              ['index', Database, 'Indexar ArcFace'] as const,
              ['no-face', AlertTriangle, 'Sem Rosto'] as const
            ] : [])
          ] as const).map(([key, Icon, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? 'border-sigma-600 text-sigma-600 dark:text-sigma-400' : 'border-transparent text-subtle hover:text-body'
              }`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ═══════════════════════════════════════════════════════════════════
              ABA: BUSCA
          ════════════════════════════════════════════════════════════════════ */}
          {tab === 'search' && (
            <>
              {searchState === 'ready' && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-sigma-400 bg-sigma-50 dark:bg-sigma-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-sigma-300 hover:bg-sigma-50/50 dark:hover:bg-sigma-900/10'
                  }`}
                >
                  <Upload className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-title font-semibold">Arraste uma foto ou clique para selecionar</p>
                  <p className="text-subtle text-sm mt-1">O servidor detecta e compara rostos automaticamente</p>
                  <p className="text-subtle text-xs mt-0.5">JPG · PNG · WEBP</p>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </div>
              )}

              {searchState === 'analyzing' && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Loader2 className="w-10 h-10 text-sigma-600 animate-spin" />
                  <p className="text-title font-semibold">{analyzeMsg}</p>
                  <p className="text-subtle text-sm">InsightFace ArcFace · buffalo_l · 512 dimensões</p>
                </div>
              )}

              {searchState === 'error' && (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                  <AlertTriangle className="w-12 h-12 text-red-500" />
                  <div>
                    <p className="text-title font-semibold">Erro na análise</p>
                    <p className="text-sm text-red-500 mt-1 max-w-sm">{errorMsg}</p>
                  </div>
                  <div className="flex gap-3">
                    {queryFile && (
                      <button onClick={reanalyze}
                        className="flex items-center gap-2 text-sm font-medium text-sigma-600 hover:text-sigma-700">
                        <RefreshCw className="w-4 h-4" /> Tentar novamente
                      </button>
                    )}
                    <button onClick={reset}
                      className="flex items-center gap-2 text-sm font-medium text-subtle hover:text-body">
                      <Upload className="w-4 h-4" /> Nova foto
                    </button>
                  </div>
                </div>
              )}

              {searchState === 'no-face' && (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                  <AlertTriangle className="w-12 h-12 text-yellow-500" />
                  <div>
                    <p className="text-title font-semibold">Nenhum rosto detectado</p>
                    <p className="text-subtle text-sm mt-1">Use uma foto com o rosto visível e bem iluminado.</p>
                  </div>
                  <button onClick={reset}
                    className="flex items-center gap-2 text-sm font-medium text-sigma-600 hover:text-sigma-700">
                    <Upload className="w-4 h-4" /> Tentar com outra foto
                  </button>
                </div>
              )}

              {searchState === 'results' && queryURL && result && (
                <>
                  {/* Canvas com bboxes */}
                  <FaceCanvas
                    imageUrl={queryURL}
                    faces={result.faces}
                    selectedIdx={selectedFaceIdx}
                    imageWidth={result.imageWidth}
                    imageHeight={result.imageHeight}
                    onSelectFace={setSelectedFaceIdx}
                    displayHeight={faceDisplayHeight}
                  />

                  {/* Banner liveness */}
                  {selectedFace?.liveness_score != null && selectedFace.liveness_score < 0.4 && (
                    <div className="flex items-center gap-2 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-4 py-2.5 text-sm text-orange-700 dark:text-orange-400">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>
                        <strong>Atenção:</strong> possível apresentação de foto (índice de vivacidade:{' '}
                        {Math.round(selectedFace.liveness_score * 100)}%). Confirme a identidade por outro meio.
                      </span>
                    </div>
                  )}

                  {/* Controle de tamanho da prévia */}
                  <div className="flex items-center gap-2">
                    <ZoomOut className="w-3.5 h-3.5 text-subtle flex-shrink-0" />
                    <input
                      type="range" min={180} max={640} step={20} value={faceDisplayHeight}
                      onChange={(e) => setFaceDisplayHeight(Number(e.target.value))}
                      className="flex-1 accent-sigma-600"
                    />
                    <ZoomIn className="w-3.5 h-3.5 text-subtle flex-shrink-0" />
                    <span className="text-xs text-subtle w-10 text-right">{faceDisplayHeight}px</span>
                  </div>

                  {/* Seletor de rosto (múltiplos rostos) */}
                  {result.faces.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-subtle flex-shrink-0" />
                      <span className="text-xs text-subtle">{result.faces.length} rostos detectados — clique na imagem ou selecione:</span>
                      <div className="flex gap-1.5">
                        {result.faces.map((f, i) => (
                          <button
                            key={f.index}
                            onClick={() => setSelectedFaceIdx(f.index)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                              f.index === selectedFaceIdx
                                ? 'bg-sigma-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-subtle hover:text-body'
                            }`}
                          >
                            #{i + 1} ({Math.round(f.det_score * 100)}%)
                            {f.liveness_score != null && f.liveness_score < 0.4 && (
                              <span className="ml-0.5 text-[9px] text-red-500 font-bold">⚠</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Controles */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                      <label className="text-xs text-subtle font-medium whitespace-nowrap">Similaridade mínima:</label>
                      <input type="range" min={0} max={90} value={minSimilarity}
                        onChange={(e) => setMinSimilarity(Number(e.target.value))}
                        className="flex-1 accent-sigma-600" />
                      <span className="text-xs font-bold text-sigma-600 w-8 text-right">{minSimilarity}%</span>
                    </div>
                    <button onClick={reanalyze}
                      className="flex items-center gap-1.5 text-xs font-medium border border-sigma-200 dark:border-sigma-800 text-sigma-600 px-3 py-1.5 rounded-lg hover:bg-sigma-50 dark:hover:bg-sigma-900/20 transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" /> Reaplicar filtro
                    </button>
                    <button onClick={reset}
                      className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 text-subtle px-3 py-1.5 rounded-lg hover:text-body transition-colors">
                      <Upload className="w-3.5 h-3.5" /> Nova foto
                    </button>
                  </div>

                  {/* Resultados */}
                  <div className="flex gap-3 text-sm flex-wrap items-center">
                    <span className="text-subtle">
                      <span className="font-bold text-title">{selectedFace?.matches.length ?? 0}</span> resultado{(selectedFace?.matches.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                    <span className="text-subtle">·</span>
                    <span className="text-subtle">
                      <span className="font-bold text-title">{result.indexed.toLocaleString('pt-BR')}</span> registros comparados
                    </span>
                    {selectedFace?.liveness_score != null && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        selectedFace.liveness_score >= 0.6
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : selectedFace.liveness_score >= 0.4
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}>
                        Vivacidade: {Math.round(selectedFace.liveness_score * 100)}%
                      </span>
                    )}
                  </div>

                  {selectedFace && selectedFace.matches.length === 0 ? (
                    <div className="flex flex-col items-center py-10 gap-3 text-center">
                      <CheckCircle className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                      <p className="text-title font-semibold">Nenhuma correspondência encontrada</p>
                      <p className="text-subtle text-sm">Reduza o limite mínimo de similaridade ou indexe mais fotos.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedFace?.matches.map((m, i) => <MatchCard key={m.id} match={m} rank={i + 1} onEdit={onEditApenado} onViewPhoto={setViewingPhotoMatch} />)}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              ABA: IA FACIAL (AVANÇADO)
          ════════════════════════════════════════════════════════════════════ */}
          {tab === 'advanced' && (
            <div className="space-y-6">
              {/* Dashboard Grid */}
              {dashboard && (
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: 'Pessoas Cadastradas', value: dashboard.totalApenados, icon: Users, color: 'from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400' },
                    { label: 'Embeddings IA', value: dashboard.totalEmbeddings, icon: ScanFace, color: 'from-green-500/10 to-emerald-500/10 text-green-600 dark:text-green-400' },
                    { label: 'Tempo Médio Busca', value: `${dashboard.avgSearchTimeMs}ms`, icon: Clock, color: 'from-purple-500/10 to-fuchsia-500/10 text-purple-600 dark:text-purple-400' },
                    { label: 'Precisão Estimada', value: `${dashboard.precisionRate}%`, icon: Percent, color: 'from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400' },
                    { label: 'Tentativas Spoof Bloqueadas', value: dashboard.livenessBlockedCount, icon: ShieldAlert, color: dashboard.livenessBlockedCount > 0 ? 'from-red-500/10 to-rose-500/10 text-red-600 dark:text-red-400' : 'from-gray-500/10 to-slate-500/10 text-subtle' },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.label} className={`rounded-xl p-3 border border-gray-100 dark:border-gray-800 bg-gradient-to-br ${card.color} flex flex-col justify-between h-20 transition-all hover:scale-[1.02] shadow-sm`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold tracking-wide uppercase truncate w-3/4">{card.label}</span>
                          <Icon className="w-3.5 h-3.5 opacity-70" />
                        </div>
                        <p className="text-lg font-black tracking-tight mt-1">{card.value.toLocaleString('pt-BR')}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Área de Busca e Captura */}
              <div className="border border-gray-100 dark:border-gray-800 rounded-2xl p-5 bg-gray-50/30 dark:bg-gray-900/10 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                  <h3 className="text-sm font-bold text-title flex items-center gap-2">
                    <Activity className="w-4 h-4 text-sigma-600" /> Teste de Reconhecimento de Última Geração
                  </h3>
                  <span className="text-xs text-subtle">SCRFD · Alinhamento · Vivacidade · Qualidade</span>
                </div>

                {advSearchState === 'ready' && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleAdvFile(f); }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-sigma-400 bg-sigma-50 dark:bg-sigma-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-sigma-300 hover:bg-sigma-50/50 dark:hover:bg-sigma-900/10'
                    }`}
                  >
                    <Upload className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-title">Arraste uma foto ou clique para testar na IA Avançada</p>
                    <p className="text-xs text-subtle mt-0.5">Analisa automaticamente contra falsificação e baixa qualidade</p>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAdvFile(f); }} />
                  </div>
                )}

                {advSearchState === 'analyzing' && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <Loader2 className="w-8 h-8 text-sigma-600 animate-spin" />
                    <p className="text-sm font-semibold text-title">Executando Pipeline de IA Facial Avançada...</p>
                    <p className="text-[10px] text-subtle">Extraindo landmarks, calculando vivacidade e qualidade 3D...</p>
                  </div>
                )}

                {advSearchState === 'error' && (
                  <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                    <AlertTriangle className="w-10 h-10 text-red-500" />
                    <div>
                      <p className="text-sm font-semibold text-title">Erro na análise da IA Facial</p>
                      <p className="text-xs text-red-500 mt-1 max-w-sm">{advErrorMsg}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={reanalyzeAdvanced} className="flex items-center gap-1.5 text-xs font-semibold text-sigma-600 hover:text-sigma-700">
                        <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                      </button>
                      <button onClick={resetAdvanced} className="flex items-center gap-1.5 text-xs font-semibold text-subtle hover:text-body">
                        <Upload className="w-3.5 h-3.5" /> Nova foto
                      </button>
                    </div>
                  </div>
                )}

                {/* Regra 6: Alerta de Anti-Spoofing (Falsificação detectada) */}
                {advSearchState === 'spoof' && (
                  <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center text-red-600">
                      <ShieldAlert className="w-7 h-7 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-black text-red-600 dark:text-red-400">Falha na validação</p>
                      <p className="text-sm font-bold text-title">Possível tentativa de apresentação artificial da face.</p>
                      <p className="text-xs text-subtle max-w-md mt-1">
                        A heurística de anti-spoofing detectou texturas típicas de tela ou papel impresso (Vivacidade: {advLivenessScore !== null ? Math.round(advLivenessScore * 100) : 0}%).
                      </p>
                    </div>
                    <button onClick={resetAdvanced} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold text-xs transition-colors">
                      Carregar outra foto
                    </button>
                  </div>
                )}

                {/* Regra 7: Alerta de Qualidade de Imagem Rejeitada */}
                {advSearchState === 'low-quality' && advQuality && (
                  <div className="flex flex-col items-center justify-center py-6 gap-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-950/40 flex items-center justify-center text-yellow-600">
                      <AlertTriangle className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-black text-yellow-600 dark:text-yellow-400">A imagem possui baixa qualidade.</p>
                      <p className="text-sm font-bold text-title">Solicite nova captura.</p>
                      <p className="text-xs text-subtle">
                        A pontuação de qualidade geral foi {advQuality.score}% (Recomendado: ≥ 45%).
                      </p>
                    </div>

                    {/* Detalhes de Qualidade */}
                    <div className="grid grid-cols-4 gap-2 w-full max-w-lg mt-1">
                      {[
                        { label: 'Nitidez (Blur)', value: advQuality.blur_score, threshold: 40 },
                        { label: 'Iluminação', value: advQuality.brightness_score, threshold: 40 },
                        { label: 'Contraste', value: advQuality.contrast_score, threshold: 40 },
                        { label: 'Pose (Centralizado)', value: advQuality.pose_score, threshold: 50 }
                      ].map((q) => (
                        <div key={q.label} className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-100 dark:border-gray-700 text-left">
                          <p className="text-[10px] text-subtle truncate">{q.label}</p>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className={`text-xs font-bold ${q.value >= q.threshold ? 'text-green-600' : 'text-red-500'}`}>{q.value}%</span>
                            <span className="text-[8px] text-subtle">limite {q.threshold}%</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button onClick={resetAdvanced} className="bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2 rounded-xl font-bold text-xs transition-colors">
                      Tentar captura novamente
                    </button>
                  </div>
                )}

                {/* Exibição dos resultados avançados e comparativo */}
                {advSearchState === 'results' && advResult && (
                  <div className="space-y-5">
                    {/* Visualização de BBoxes */}
                    {advQueryURL && advResult.faces?.[0] && (
                      <FaceCanvas
                        imageUrl={advQueryURL}
                        faces={advResult.faces}
                        selectedIdx={advSelectedFaceIdx}
                        imageWidth={advResult.imageWidth}
                        imageHeight={advResult.imageHeight}
                        onSelectFace={setAdvSelectedFaceIdx}
                        displayHeight={280}
                      />
                    )}

                    {/* Regra 11: Painel Comparativo Lado a Lado (ArcFace vs IA Facial) */}
                    <div className="grid grid-cols-2 gap-4 border-y border-gray-100 dark:border-gray-800 py-4">
                      {/* Coluna ArcFace */}
                      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50/40 dark:bg-gray-800/20 space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full translate-x-8 -translate-y-8" />
                        <h4 className="font-extrabold text-xs text-blue-600 uppercase tracking-wide">Mecanismo Clássico (ArcFace)</h4>
                        
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-subtle">Status:</span>
                            <span className="font-bold text-green-600 flex items-center gap-1">✓ Funcionando</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-subtle">Melhor Similaridade:</span>
                            <span className="font-extrabold text-title">
                              {advResult.arcFaceComparison ? `${advResult.faces[0]?.matches?.[0]?.similarity ?? 0}%` : '--'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-subtle">Tempo de Resposta:</span>
                            <span className="font-semibold text-title">
                              {advResult.arcFaceComparison ? `${advResult.arcFaceComparison.durationMs} ms` : '--'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Coluna IA Facial Avançado */}
                      <div className="rounded-xl border border-green-200 dark:border-green-800 p-4 bg-green-50/20 dark:bg-green-950/10 space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full translate-x-8 -translate-y-8" />
                        <h4 className="font-extrabold text-xs text-green-600 uppercase tracking-wide">Evolução IA Facial (Avançado)</h4>
                        
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-subtle">Status:</span>
                            <span className="font-bold text-green-600 flex items-center gap-1">✓ Funcionando</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-subtle">Precisão / Similaridade:</span>
                            <span className="font-extrabold text-green-600">
                              {advResult.faces[0]?.matches?.[0]?.similarity ?? 0}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-subtle">Confiança Vivacidade:</span>
                            <span className="font-semibold text-title flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                              {advLivenessScore !== null ? `${Math.round(advLivenessScore * 100)}%` : '--'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-subtle">Qualidade Geral:</span>
                            <span className="font-semibold text-title">
                              {advQuality ? `${advQuality.score}%` : '--'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-subtle">Tempo de Resposta:</span>
                            <span className="font-semibold text-green-600">{advResult.executionTimeMs} ms</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Controles do Comparativo */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <label className="text-xs text-subtle font-medium">Similaridade mínima:</label>
                        <input type="range" min={0} max={90} value={advMinSimilarity}
                          onChange={(e) => setAdvMinSimilarity(Number(e.target.value))}
                          className="flex-1 accent-sigma-600" />
                        <span className="text-xs font-bold text-sigma-600 w-8 text-right">{advMinSimilarity}%</span>
                      </div>
                      <button onClick={reanalyzeAdvanced} className="flex items-center gap-1.5 text-xs font-medium border border-sigma-200 dark:border-sigma-800 text-sigma-600 px-3 py-1.5 rounded-lg hover:bg-sigma-50 transition-colors">
                        <RefreshCw className="w-3 h-3" /> Reaplicar filtro
                      </button>
                      <button onClick={resetAdvanced} className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 text-subtle px-3 py-1.5 rounded-lg hover:text-body transition-colors">
                        <Upload className="w-3 h-3" /> Nova foto
                      </button>
                    </div>

                    {/* Resultados dos Matches */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-title uppercase tracking-wide border-b border-gray-100 dark:border-gray-800 pb-1">
                        Pessoas Correspondentes ({advResult.faces[0]?.matches?.length ?? 0})
                      </h4>
                      {advResult.faces[0]?.matches?.length === 0 ? (
                        <p className="text-xs text-subtle py-4 text-center">Nenhuma correspondência facial encontrada com similaridade ≥ {advMinSimilarity}%</p>
                      ) : (
                        <div className="space-y-2">
                          {advResult.faces[0]?.matches.map((m: any, i: number) => (
                            <MatchCard key={m.id} match={m} rank={i + 1} onEdit={onEditApenado} onViewPhoto={setViewingPhotoMatch} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Histórico Recente de Reconhecimento */}
              {dashboard?.recentHistory && dashboard.recentHistory.length > 0 && (
                <div className="border border-gray-100 dark:border-gray-800 rounded-2xl p-4 bg-white dark:bg-gray-900 space-y-3 shadow-sm">
                  <h3 className="text-xs font-bold text-title uppercase tracking-wider flex items-center gap-2 border-b border-gray-50 dark:border-gray-800 pb-2">
                    <History className="w-4 h-4 text-subtle" /> Histórico Recente de Verificações Avançadas
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 text-subtle font-medium">
                          <th className="py-2">Data/Hora</th>
                          <th className="py-2">Status Validação</th>
                          <th className="py-2">Melhor Match</th>
                          <th className="py-2">Qualidade</th>
                          <th className="py-2">Vivacidade</th>
                          <th className="py-2 text-right">Tempo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.recentHistory.map((item: any, idx: number) => {
                          const date = new Date(item.createdAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
                          return (
                            <tr key={idx} className="border-b border-gray-50 dark:border-gray-850 hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                              <td className="py-2.5 text-subtle">{date}</td>
                              <td className="py-2.5 font-semibold">
                                {item.livenessBlocked ? (
                                  <span className="text-red-500">⚠ Spoof Bloqueado</span>
                                ) : item.qualityRejected ? (
                                  <span className="text-yellow-600 dark:text-yellow-400">⚡ Baixa Qualidade</span>
                                ) : (
                                  <span className="text-green-600">✓ Aprovado</span>
                                )}
                              </td>
                              <td className="py-2.5 font-bold text-title">{item.success && item.highestSimilarity ? `${item.highestSimilarity}%` : '--'}</td>
                              <td className="py-2.5 text-subtle">{item.qualityScore}%</td>
                              <td className="py-2.5 text-subtle">{Math.round(item.livenessScore * 100)}%</td>
                              <td className="py-2.5 text-right font-medium text-title">{item.executionTimeMs} ms</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status do Job de Migração Avançada */}
              {advIndexStatus && (
                <div className="border border-gray-100 dark:border-gray-800 rounded-2xl p-4 bg-white dark:bg-gray-900 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                    <div>
                      <h4 className="text-xs font-bold text-title uppercase tracking-wide">Indexador da IA Facial (Migração Automática)</h4>
                      <p className="text-[10px] text-subtle mt-0.5">Calcula embeddings avançados para a base de fotos existente</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isAdvIndexing ? 'bg-green-100 text-green-700 animate-pulse' : 'bg-gray-100 text-subtle'}`}>
                      {isAdvIndexing ? 'Indexando em background' : 'Parado'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Total Fotos', value: advIndexStatus.withPhoto },
                      { label: 'Embeddings IA', value: advIndexStatus.indexed, color: 'text-green-600' },
                      { label: 'Sem Rosto', value: advIndexStatus.noFace },
                      { label: 'Pendentes', value: advIndexStatus.remaining, color: advIndexStatus.remaining > 0 ? 'text-yellow-600' : 'text-green-600' }
                    ].map((c) => (
                      <div key={c.label} className="bg-gray-50/50 dark:bg-gray-800/10 rounded-xl p-3 border border-gray-100 dark:border-gray-800 text-center">
                        <p className={`text-lg font-black ${c.color || 'text-title'}`}>{c.value.toLocaleString('pt-BR')}</p>
                        <p className="text-[10px] text-subtle mt-0.5 font-medium">{c.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Barra de progresso do job avançado */}
                  {(isAdvIndexing || (advIndexProgress && advIndexProgress.current > 0)) && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-title">
                          {advIndexProgress.current.toLocaleString('pt-BR')} / {advIndexProgress.total.toLocaleString('pt-BR')} fotos processadas
                        </span>
                        {isAdvIndexing && advIndexProgress.current > 0 && (
                          <span className="text-subtle">
                            {(() => {
                              const elapsed = (Date.now() - advIndexProgress.startTime) / 1000;
                              const rate = advIndexProgress.current / elapsed;
                              const remainingSecs = (advIndexProgress.total - advIndexProgress.current) / rate;
                              return `${rate.toFixed(1)} fotos/s · ETA ${fmtTime(remainingSecs)}`;
                            })()}
                          </span>
                        )}
                      </div>
                      <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-300 rounded-full"
                          style={{ width: advIndexProgress.total > 0 ? `${(advIndexProgress.current / advIndexProgress.total) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {!isAdvIndexing ? (
                      <button
                        onClick={startAdvIndexing}
                        disabled={advIndexStatus.remaining === 0}
                        className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-bold text-xs transition-colors disabled:opacity-50"
                      >
                        <ScanFace className="w-3.5 h-3.5" /> Iniciar Migração Completa
                      </button>
                    ) : (
                      <button
                        onClick={stopAdvIndexing}
                        className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold text-xs transition-colors"
                      >
                        <X className="w-3.5 h-3.5" /> Parar Migração
                      </button>
                    )}
                    <button onClick={fetchAdvStatus} className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 text-subtle px-4 py-2 rounded-xl font-bold text-xs hover:text-body transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" /> Atualizar Status
                    </button>
                    {isSuperAdmin && !isAdvIndexing && (
                      <button
                        onClick={() => setShowAdvancedClearConfirm(true)}
                        className="flex items-center gap-1.5 text-red-600 hover:text-red-700 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-xl font-bold text-xs transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Limpar Progresso
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              ABA: INDEXAR
          ════════════════════════════════════════════════════════════════════ */}
          {tab === 'index' && (
            <div className="space-y-5">
              {/* Contadores */}
              {indexStatus && (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Com foto', value: indexStatus.withPhoto, color: 'text-sigma-600' },
                    { label: 'Indexadas', value: indexStatus.indexed, color: 'text-green-600 dark:text-green-400' },
                    { label: 'Sem rosto', value: indexStatus.noFace ?? 0, color: 'text-gray-500 dark:text-gray-400' },
                    { label: 'Pendentes', value: indexStatus.remaining, color: indexStatus.remaining > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4 text-center">
                      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-subtle mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              {indexError && (
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
                  {indexError}
                </div>
              )}

              {/* Progresso */}
              {(isIndexing || indexProgress.total > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-title">
                      {indexProgress.current.toLocaleString('pt-BR')} / {indexProgress.total.toLocaleString('pt-BR')}
                    </div>
                    {isIndexing && indexProgress.current > 0 && (
                      <div className="text-xs text-subtle">
                        {(() => {
                          const elapsed = (Date.now() - indexProgress.startTime) / 1000;
                          const rate = indexProgress.current / elapsed;
                          return `${rate.toFixed(1)} fotos/s · ETA ${fmtTime(etaSeconds)}`;
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sigma-500 to-sigma-700 transition-all duration-300 rounded-full"
                      style={{ width: indexProgress.total > 0 ? `${(indexProgress.current / indexProgress.total) * 100}%` : '0%' }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-subtle">
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {indexProgress.faces.toLocaleString('pt-BR')} rostos detectados
                    </span>
                    <span>{indexProgress.skipped.toLocaleString('pt-BR')} sem rosto</span>
                    {indexProgress.errors > 0 && (
                      <span className="text-red-500">{indexProgress.errors.toLocaleString('pt-BR')} erros</span>
                    )}
                  </div>
                  {!isIndexing && indexProgress.current >= indexProgress.total && indexProgress.total > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" /> Indexação concluída!
                    </p>
                  )}
                </div>
              )}

              {/* Info */}
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 text-sm space-y-1">
                <p className="font-semibold text-blue-800 dark:text-blue-300">Como funciona:</p>
                <ul className="list-disc pl-4 space-y-1 text-xs text-blue-700 dark:text-blue-400">
                  <li>O servidor processa cada foto usando InsightFace buffalo_l (ArcFace 512 dims).</li>
                  <li>Lotes de {BATCH_SIZE} fotos por requisição — o modelo Python carrega uma vez por lote.</li>
                  <li>Fotos sem rosto detectável são ignoradas e não reprocessadas.</li>
                  <li>Pode ser interrompido e retomado a qualquer momento.</li>
                  <li>Requer: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">pip install insightface onnxruntime opencv-python</code></li>
                </ul>
              </div>

              <div className="flex gap-3 flex-wrap">
                {!isIndexing ? (
                  <>
                    <button
                      onClick={startIndexing}
                      disabled={(indexStatus?.remaining ?? 1) === 0}
                      className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                      <Database className="w-4 h-4" />
                      {(indexStatus?.remaining ?? 1) === 0 ? 'Tudo indexado' : 'Iniciar indexação completa'}
                    </button>
                    <button onClick={fetchStatus}
                      className="flex items-center gap-2 text-sm font-medium text-sigma-600 hover:text-sigma-700 border border-sigma-200 dark:border-sigma-800 hover:bg-sigma-50 dark:hover:bg-sigma-900/20 px-4 py-2.5 rounded-xl transition-colors">
                      <RefreshCw className="w-4 h-4" /> Atualizar
                    </button>
                    {isSuperAdmin && (
                      <button
                        onClick={() => setShowClearConfirm(true)}
                        className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2.5 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" /> Limpar índice
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={stopIndexing}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                  >
                    <X className="w-4 h-4" /> Parar indexação
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              ABA: SEM ROSTO
          ════════════════════════════════════════════════════════════════════ */}
          {tab === 'no-face' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-title flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" /> Revisão de Fotos Sem Rosto Detectado
                  </h3>
                  <p className="text-[10px] text-subtle mt-0.5">Fotos que foram processadas mas nenhum rosto foi detectado</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setNoFaceType('advanced'); setNoFacePage(1); }}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                      noFaceType === 'advanced'
                        ? 'bg-sigma-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-subtle hover:text-body'
                    }`}
                  >
                    IA Avançada
                  </button>
                  <button
                    onClick={() => { setNoFaceType('classic'); setNoFacePage(1); }}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                      noFaceType === 'classic'
                        ? 'bg-sigma-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-subtle hover:text-body'
                    }`}
                  >
                    IA Clássica
                  </button>
                </div>
              </div>

              {noFaceData?.records && noFaceData.records.length > 0 && (
                <div className="flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/10 border border-gray-100 dark:border-gray-850 rounded-xl p-3 flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 font-medium text-title cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 dark:border-gray-755 text-sigma-600 accent-sigma-600 cursor-pointer w-4 h-4"
                        checked={
                          noFaceData.records.length > 0 &&
                          noFaceData.records.every((r: any) => selectedNoFaceIds.includes(r.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const pageIds = noFaceData.records.map((r: any) => r.id);
                            setSelectedNoFaceIds((prev) => {
                              const union = new Set([...prev, ...pageIds]);
                              return Array.from(union);
                            });
                          } else {
                            const pageIds = noFaceData.records.map((r: any) => r.id);
                            setSelectedNoFaceIds((prev) => prev.filter((id) => !pageIds.includes(id)));
                          }
                        }}
                      />
                      Selecionar Todos da Página
                    </label>
                    {selectedNoFaceIds.length > 0 && (
                      <span className="text-subtle">
                        <strong>{selectedNoFaceIds.length}</strong> selecionado{selectedNoFaceIds.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {selectedNoFaceIds.length > 0 && (
                      <button
                        onClick={() => handleReindex()}
                        className="flex items-center gap-1.5 bg-sigma-600 hover:bg-sigma-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" /> Reindexar Selecionados ({selectedNoFaceIds.length})
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm('Deseja mesmo reindexar TODOS os registros marcados como sem rosto no banco de dados?')) {
                          handleReindex();
                        }
                      }}
                      className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 text-subtle px-3 py-1.5 rounded-lg font-bold hover:text-body transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" /> Reindexar Todos
                    </button>
                  </div>
                </div>
              )}

              {noFaceLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-8 h-8 text-sigma-600 animate-spin" />
                  <p className="text-sm font-semibold text-title">Carregando registros...</p>
                </div>
              ) : noFaceData?.records && noFaceData.records.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {noFaceData.records.map((r: any) => {
                      const isSelected = selectedNoFaceIds.includes(r.id);
                      return (
                        <div
                          key={r.id}
                          className={`rounded-xl border p-3 flex flex-col justify-between gap-3 relative transition-all ${
                            isSelected
                              ? 'border-sigma-500 bg-sigma-50/20 dark:bg-sigma-900/10'
                              : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/20'
                          }`}
                        >
                          {/* Checkbox de seleção */}
                          <div className="absolute top-2 right-2 z-10">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 dark:border-gray-755 text-sigma-600 accent-sigma-600 cursor-pointer w-4 h-4"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedNoFaceIds((prev) => [...prev, r.id]);
                                } else {
                                  setSelectedNoFaceIds((prev) => prev.filter((id) => id !== r.id));
                                }
                              }}
                            />
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-205 dark:bg-gray-700 flex-shrink-0">
                              {r.photoPath ? (
                                <img src={`/api/apenados/${r.id}/foto`} alt={r.name} loading="lazy" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><ScanFace className="w-5 h-5 text-gray-400" /></div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 pr-4">
                              <p className="text-xs font-bold text-title truncate" title={r.name}>{r.name}</p>
                              <p className="text-[10px] text-subtle truncate">{r.matricula || 'Sem matrícula'}</p>
                              <p className="text-[10px] text-subtle truncate">{r.unidade || 'Sem unidade'}</p>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            {onEditApenado && (
                              <button
                                onClick={() => onEditApenado(r.id)}
                                className="flex-1 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 hover:text-red-700 bg-white dark:bg-gray-950 text-[10px] font-bold transition-colors hover:bg-red-50/30 flex items-center justify-center gap-1"
                              >
                                <Pencil className="w-3 h-3" /> Editar
                              </button>
                            )}
                            <button
                              onClick={() => handleReindex(r.id)}
                              className="flex-1 py-1.5 rounded-lg border border-sigma-200 dark:border-sigma-850 text-sigma-600 hover:text-sigma-700 bg-white dark:bg-gray-950 text-[10px] font-bold transition-colors hover:bg-sigma-50/30 flex items-center justify-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" /> Reindexar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Controles de Paginação */}
                  {noFaceData.pagination && noFaceData.pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-3 text-xs">
                      <span className="text-subtle">
                        Página <strong>{noFaceData.pagination.page}</strong> de <strong>{noFaceData.pagination.totalPages}</strong> ({noFaceData.pagination.total} registros)
                      </span>
                      <div className="flex gap-2">
                        <button
                          disabled={noFacePage === 1}
                          onClick={() => setNoFacePage(p => Math.max(1, p - 1))}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                        >
                          Anterior
                        </button>
                        <button
                          disabled={noFacePage >= noFaceData.pagination.totalPages}
                          onClick={() => setNoFacePage(p => p + 1)}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                        >
                          Próximo
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                  <div>
                    <p className="text-sm font-semibold text-title">Nenhum registro encontrado</p>
                    <p className="text-xs text-subtle mt-0.5">Todas as fotos analisadas possuem rostos detectáveis!</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirm clear modal */}
      {showClearConfirm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-red-200 dark:border-red-800 p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
              <p className="font-bold text-title">Limpar índice facial?</p>
            </div>
            <p className="text-sm text-subtle">
              Todos os embeddings ArcFace serão removidos do banco de dados.
              A indexação precisará ser refeita do zero.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-subtle hover:text-body border border-gray-200 dark:border-gray-700 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={clearIndex}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">
                Limpar índice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm advanced clear modal */}
      {showAdvancedClearConfirm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-red-200 dark:border-red-800 p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
              <p className="font-bold text-title">Reiniciar indexação IA Facial?</p>
            </div>
            <p className="text-sm text-subtle">
              Todos os embeddings da IA Facial Avançada e os scores de liveness/qualidade serão removidos.
              O processo de migração precisará ser executado do zero.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowAdvancedClearConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-subtle hover:text-body border border-gray-200 dark:border-gray-700 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={clearAdvancedIndex}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">
                Reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visualizador de Foto Ampliada */}
      {viewingPhotoMatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setViewingPhotoMatch(null)} />
          <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 mb-3">
              <h3 className="font-bold text-title text-sm line-clamp-2 pr-4">{viewingPhotoMatch.name}</h3>
              <button 
                onClick={() => setViewingPhotoMatch(null)}
                className="text-subtle hover:text-body p-1 bg-gray-100 dark:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 relative">
              {viewingPhotoMatch.photoPath ? (
                <img 
                  src={`/api/apenados/${viewingPhotoMatch.id}/foto`} 
                  alt={viewingPhotoMatch.name} 
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ScanFace className="w-12 h-12 text-gray-400" />
                </div>
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-800 space-y-1.5 text-xs text-subtle">
              <div className="flex justify-between">
                <span>Matrícula:</span>
                <span className="font-semibold text-title">{viewingPhotoMatch.matricula || 'Sem matrícula'}</span>
              </div>
              <div className="flex justify-between">
                <span>Unidade:</span>
                <span className="font-semibold text-title">{viewingPhotoMatch.unidade || 'Sem unidade'}</span>
              </div>
              {viewingPhotoMatch.faccao && (
                <div className="flex justify-between">
                  <span>Facção:</span>
                  <span className="font-semibold text-orange-600 dark:text-orange-400">{viewingPhotoMatch.faccao}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Similaridade Busca:</span>
                <span className="font-extrabold text-sigma-600 dark:text-sigma-400">{viewingPhotoMatch.similarity}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
