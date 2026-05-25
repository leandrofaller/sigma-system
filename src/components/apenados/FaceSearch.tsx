'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useIndexing } from '@/contexts/IndexingContext';
import {
  X, ScanFace, Upload, Loader2, AlertTriangle, RefreshCw,
  Database, Search, CheckCircle, Trash2, Users, ZoomIn, ZoomOut,
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

type Tab = 'search' | 'index';
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

function MatchCard({ match, rank }: { match: FaceMatch; rank: number }) {
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
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
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
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className={`text-xl font-black tabular-nums ${simColor(match.similarity)}`}>{match.similarity}%</span>
          <span className={`text-[10px] font-semibold ${simColor(match.similarity)}`}>{simLabel(match.similarity)}</span>
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

interface Props { onClose: () => void; userRole: string }

export function FaceSearch({ onClose, userRole }: Props) {
  const [tab, setTab] = useState<Tab>('search');

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

  // Index
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { isIndexing, progress: indexProgress, indexError, startIndexing, stopIndexing } = useIndexing();

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
      setErrorMsg(err.message || 'Erro no reconhecimento facial.');
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

  const clearIndex = async () => {
    setShowClearConfirm(false);
    try {
      const res = await fetch('/api/apenados/face/clear', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) fetchStatus();
      else setErrorMsg(data.error || 'Erro ao limpar índice');
    } catch { setErrorMsg('Erro ao limpar índice'); }
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
        {isAdmin && (
          <div className="flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            {([['search', Search, 'Buscar por Rosto'], ['index', Database, 'Indexar Banco']] as const).map(([key, Icon, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === key ? 'border-sigma-600 text-sigma-600 dark:text-sigma-400' : 'border-transparent text-subtle hover:text-body'
                }`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        )}

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
                  <div className="flex gap-3 text-sm">
                    <span className="text-subtle">
                      <span className="font-bold text-title">{selectedFace?.matches.length ?? 0}</span> resultado{(selectedFace?.matches.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                    <span className="text-subtle">·</span>
                    <span className="text-subtle">
                      <span className="font-bold text-title">{result.indexed.toLocaleString('pt-BR')}</span> registros comparados
                    </span>
                  </div>

                  {selectedFace && selectedFace.matches.length === 0 ? (
                    <div className="flex flex-col items-center py-10 gap-3 text-center">
                      <CheckCircle className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                      <p className="text-title font-semibold">Nenhuma correspondência encontrada</p>
                      <p className="text-subtle text-sm">Reduza o limite mínimo de similaridade ou indexe mais fotos.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedFace?.matches.map((m, i) => <MatchCard key={m.id} match={m} rank={i + 1} />)}
                    </div>
                  )}
                </>
              )}
            </>
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
    </div>
  );
}
