'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, ScanFace, Upload, Loader2, AlertTriangle, RefreshCw,
  Database, Search, CheckCircle, ChevronDown, ChevronUp,
  Crop, ZoomIn,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Trait { name: string; similarity: number }

interface FaceMatch {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
  similarity: number;
  distance: number;
  traits: Trait[];
}

interface IndexStatus {
  total: number;
  indexed: number;
  withPhoto: number;
  remaining: number;
}

interface SelectionRect { x: number; y: number; w: number; h: number }

type Tab = 'search' | 'index';
type SearchState =
  | 'loading'     // carregando modelos
  | 'ready'       // aguardando upload
  | 'selecting'   // imagem carregada, aguardando seleção/confirmação
  | 'detecting'   // detectando rosto
  | 'searching'   // buscando no DB
  | 'results'     // resultados prontos
  | 'no-face'     // nenhum rosto detectado
  | 'error';

const MODEL_URL = '/models/face-api';
const BATCH_SIZE = 200;   // IDs buscados por chamada
const CONCURRENCY = 3;    // fotos processadas em paralelo

// ─── Helpers ─────────────────────────────────────────────────────────────────

function similarityColor(s: number) {
  if (s >= 70) return 'text-green-600 dark:text-green-400';
  if (s >= 45) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-500 dark:text-red-400';
}
function similarityBg(s: number) {
  if (s >= 70) return 'bg-green-500';
  if (s >= 45) return 'bg-yellow-400';
  return 'bg-red-400';
}
function similarityLabel(s: number) {
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
  const [expanded, setExpanded] = useState(rank <= 3);
  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${
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
          <span className={`text-xl font-black tabular-nums ${similarityColor(match.similarity)}`}>{match.similarity}%</span>
          <span className={`text-[10px] font-semibold ${similarityColor(match.similarity)}`}>{similarityLabel(match.similarity)}</span>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="p-1 text-gray-400 hover:text-body transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Barra geral */}
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800">
        <div className={`h-full transition-all ${similarityBg(match.similarity)}`} style={{ width: `${match.similarity}%` }} />
      </div>

      {/* Traços por região */}
      {expanded && (
        <div className="p-3 grid grid-cols-5 gap-1.5">
          {match.traits.map(({ name, similarity }) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <div className="w-full h-12 bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden flex items-end">
                <div className={`w-full rounded-md ${similarityBg(similarity)}`} style={{ height: `${similarity}%` }} />
              </div>
              <span className={`text-[10px] font-bold tabular-nums ${similarityColor(similarity)}`}>{similarity}%</span>
              <span className="text-[9px] text-subtle text-center leading-tight">{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props { onClose: () => void; userRole: string }

export function FaceSearch({ onClose, userRole }: Props) {
  const [tab, setTab] = useState<Tab>('search');
  const [searchState, setSearchState] = useState<SearchState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [queryURL, setQueryURL] = useState<string | null>(null);
  const [matches, setMatches] = useState<FaceMatch[]>([]);
  const [totalIndexed, setTotalIndexed] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [minSimilarity, setMinSimilarity] = useState(30);

  // Seleção de área
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  // Indexação
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0, errors: 0, faces: 0, startTime: 0 });
  const stopIndexRef = useRef(false);

  const faceapiRef = useRef<any>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultImgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Carregar modelos ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const fa = await import('@vladmandic/face-api');
        faceapiRef.current = fa;
        await Promise.all([
          fa.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setSearchState('ready');
        fetchStatus();
      } catch {
        setErrorMsg('Falha ao carregar modelos. Execute: node scripts/setup-face-models.js');
        setSearchState('error');
      }
    })();
  }, []);

  const fetchStatus = async () => {
    try { setIndexStatus(await (await fetch('/api/apenados/face/status')).json()); } catch {}
  };

  // ── Canvas de seleção: desenho ─────────────────────────────────────────────
  const redrawSelection = useCallback((rect: SelectionRect | null) => {
    const canvas = selectionCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!rect || rect.w < 4 || rect.h < 4) return;

    // Escurece fora da seleção
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);

    // Borda
    ctx.strokeStyle = '#4f8cff';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    // Cantos
    ctx.fillStyle = '#4f8cff';
    for (const [cx, cy] of [
      [rect.x, rect.y], [rect.x + rect.w, rect.y],
      [rect.x, rect.y + rect.h], [rect.x + rect.w, rect.y + rect.h],
    ]) {
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
    }

    // Dimensões
    ctx.fillStyle = 'rgba(79,140,255,0.9)';
    ctx.fillRect(rect.x, rect.y - 20, 75, 18);
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.fillText(`${Math.round(rect.w)} × ${Math.round(rect.h)}`, rect.x + 4, rect.y - 6);
  }, []);

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);
    isDrawingRef.current = true;
    drawStartRef.current = pos;
    setSelectionRect(null);
    redrawSelection(null);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !drawStartRef.current) return;
    const pos = getCanvasPos(e);
    const start = drawStartRef.current;
    const rect: SelectionRect = {
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x),
      h: Math.abs(pos.y - start.y),
    };
    setSelectionRect(rect);
    redrawSelection(rect);
  };

  const onMouseUp = () => { isDrawingRef.current = false; };

  // ── Processar imagem para detecção ─────────────────────────────────────────
  const runDetection = useCallback(async (source: HTMLImageElement | HTMLCanvasElement) => {
    const fa = faceapiRef.current;
    if (!fa) return;
    setSearchState('detecting');

    try {
      const detection = await fa
        .detectSingleFace(source, new fa.SsdMobilenetv1Options({ minConfidence: 0.35 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setSearchState('no-face');
        return;
      }

      // Desenha landmarks no canvas de resultado
      if (resultCanvasRef.current && resultImgRef.current) {
        const dims = fa.matchDimensions(resultCanvasRef.current, resultImgRef.current);
        const resized = fa.resizeResults(detection, dims);
        const ctx = resultCanvasRef.current.getContext('2d')!;
        ctx.clearRect(0, 0, resultCanvasRef.current.width, resultCanvasRef.current.height);
        fa.draw.drawFaceLandmarks(resultCanvasRef.current, resized);
        const box = resized.detection.box;
        ctx.strokeStyle = '#4f8cff';
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      }

      setSearchState('searching');
      const descriptor = Array.from(detection.descriptor as Float32Array);

      const res = await fetch('/api/apenados/face/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptor, topN: 20, minSimilarity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);

      setMatches(data.matches ?? []);
      setTotalIndexed(data.indexed ?? 0);
      setSearchState('results');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro no reconhecimento facial.');
      setSearchState('error');
    }
  }, [minSimilarity]);

  // Analisa área selecionada (recorte do canvas)
  const analyzeSelection = useCallback(async () => {
    if (!selectionRect || !loadedImageRef.current || !selectionCanvasRef.current) return;
    const img = loadedImageRef.current;
    const displayCanvas = selectionCanvasRef.current;

    const scaleX = img.naturalWidth / displayCanvas.width;
    const scaleY = img.naturalHeight / displayCanvas.height;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.round(selectionRect.w * scaleX);
    cropCanvas.height = Math.round(selectionRect.h * scaleY);
    cropCanvas.getContext('2d')!.drawImage(
      img,
      selectionRect.x * scaleX, selectionRect.y * scaleY,
      cropCanvas.width, cropCanvas.height,
      0, 0, cropCanvas.width, cropCanvas.height,
    );

    await runDetection(cropCanvas);
  }, [selectionRect, runDetection]);

  // Analisa foto inteira
  const analyzeFullImage = useCallback(async () => {
    if (!loadedImageRef.current) return;
    await runDetection(loadedImageRef.current);
  }, [runDetection]);

  // ── Carregar arquivo ───────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setQueryURL(url);
    setSelectionRect(null);
    setMatches([]);
    setErrorMsg('');

    const img = new Image();
    img.onload = () => {
      loadedImageRef.current = img;
      setSearchState('selecting');
      // Ajusta canvas ao tamanho exibido (após render, via useEffect abaixo)
      setTimeout(() => {
        const canvas = selectionCanvasRef.current;
        if (!canvas) return;
        const displayed = canvas.parentElement?.querySelector('img') as HTMLImageElement | null;
        if (displayed) {
          canvas.width = displayed.clientWidth;
          canvas.height = displayed.clientHeight;
        }
      }, 50);
    };
    img.onerror = () => setErrorMsg('Falha ao carregar a imagem.');
    img.src = url;
  }, []);

  // ── Indexação em lote (loop completo) ─────────────────────────────────────
  const startIndexing = useCallback(async () => {
    const fa = faceapiRef.current;
    if (!fa || isIndexing) return;
    setIsIndexing(true);
    stopIndexRef.current = false;

    // Busca total de pendentes para mostrar progresso correto
    const statusData: IndexStatus = await (await fetch('/api/apenados/face/status')).json();
    const grandTotal = statusData.remaining;
    const startTime = Date.now();
    setIndexProgress({ current: 0, total: grandTotal, errors: 0, faces: 0, startTime });

    let processed = 0;
    let totalFaces = 0;
    let totalErrors = 0;

    // Loop até esgotar todos os pendentes
    while (!stopIndexRef.current) {
      const idsRes = await fetch(`/api/apenados/face/unindexed?limit=${BATCH_SIZE}`);
      const { ids }: { ids: string[] } = await idsRes.json();
      if (ids.length === 0) break;

      // Pool de workers concorrentes
      const queue = [...ids];
      let batchFaces = 0;
      let batchErrors = 0;

      async function worker() {
        while (queue.length > 0 && !stopIndexRef.current) {
          const id = queue.shift()!;
          let gotFace = false;
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = `/api/apenados/${id}/foto?t=${Date.now()}`;
            });
            if (img.naturalWidth > 0) {
              const det = await fa
                .detectSingleFace(img, new fa.SsdMobilenetv1Options({ minConfidence: 0.35 }))
                .withFaceDescriptor();
              if (det) {
                await fetch(`/api/apenados/${id}/face`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ descriptor: Array.from(det.descriptor as Float32Array) }),
                });
                gotFace = true;
              }
            }
          } catch {}

          processed++;
          if (gotFace) batchFaces++; else batchErrors++;

          const elapsed = (Date.now() - startTime) / 1000;
          const rate = processed / elapsed;
          const remaining = grandTotal - processed;
          const eta = rate > 0 ? remaining / rate : 0;
          setIndexProgress({
            current: processed,
            total: grandTotal,
            errors: totalErrors + batchErrors,
            faces: totalFaces + batchFaces,
            startTime,
          });
          // Não usamos eta no state — calculamos na render
          void eta;
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      totalFaces += batchFaces;
      totalErrors += batchErrors;
    }

    setIsIndexing(false);
    fetchStatus();
  }, [isIndexing]);

  const reset = () => {
    setSearchState('ready');
    setQueryURL(null);
    setMatches([]);
    setErrorMsg('');
    setSelectionRect(null);
    loadedImageRef.current = null;
    if (selectionCanvasRef.current) {
      const ctx = selectionCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, selectionCanvasRef.current.width, selectionCanvasRef.current.height);
    }
  };

  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

  // ETA calculado na render
  const etaSeconds = (() => {
    const { current, total, startTime } = indexProgress;
    if (!startTime || !current) return Infinity;
    const rate = current / ((Date.now() - startTime) / 1000);
    return (total - current) / rate;
  })();

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
              <p className="text-white font-bold text-sm">Reconhecimento Facial</p>
              <p className="text-white/70 text-xs">
                {indexStatus
                  ? `${indexStatus.indexed.toLocaleString('pt-BR')} / ${indexStatus.withPhoto.toLocaleString('pt-BR')} fotos indexadas`
                  : 'Carregando modelos de IA...'}
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
              {/* Carregando modelos */}
              {searchState === 'loading' && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <Loader2 className="w-10 h-10 text-sigma-600 animate-spin" />
                  <p className="text-title font-semibold">Carregando modelos de IA...</p>
                  <p className="text-subtle text-sm">SSD MobileNet · Landmark 68 pts · Face Recognition (~12 MB)</p>
                </div>
              )}

              {/* Erro */}
              {searchState === 'error' && (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                  <AlertTriangle className="w-12 h-12 text-red-500" />
                  <div>
                    <p className="text-title font-semibold">Falha nos modelos</p>
                    <p className="text-sm text-red-500 mt-1 max-w-sm">{errorMsg}</p>
                  </div>
                  <button onClick={() => window.location.reload()}
                    className="flex items-center gap-2 text-sm font-medium text-sigma-600 hover:text-sigma-700">
                    <RefreshCw className="w-4 h-4" /> Recarregar
                  </button>
                </div>
              )}

              {/* Upload zone */}
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
                  <p className="text-subtle text-sm mt-1">JPG · PNG · WEBP</p>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </div>
              )}

              {/* ── SELEÇÃO DE ÁREA ─────────────────────────────────────────── */}
              {searchState === 'selecting' && queryURL && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-title">
                    <Crop className="w-4 h-4 text-sigma-500" />
                    Selecione a área com o rosto (ou analise a foto inteira)
                  </div>

                  {/* Container da imagem + canvas */}
                  <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 cursor-crosshair select-none"
                    style={{ maxHeight: '400px' }}>
                    <img
                      src={queryURL}
                      alt="Foto para análise"
                      className="w-full h-full object-contain"
                      style={{ maxHeight: '400px', display: 'block' }}
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        const canvas = selectionCanvasRef.current;
                        if (canvas) {
                          canvas.width = img.clientWidth;
                          canvas.height = img.clientHeight;
                        }
                      }}
                    />
                    <canvas
                      ref={selectionCanvasRef}
                      className="absolute inset-0"
                      style={{ cursor: 'crosshair' }}
                      onMouseDown={onMouseDown}
                      onMouseMove={onMouseMove}
                      onMouseUp={onMouseUp}
                      onMouseLeave={onMouseUp}
                    />
                  </div>

                  {selectionRect && selectionRect.w > 10 && selectionRect.h > 10 && (
                    <p className="text-xs text-sigma-600 dark:text-sigma-400 font-medium">
                      Selecionado: {Math.round(selectionRect.w)} × {Math.round(selectionRect.h)} px
                    </p>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={analyzeSelection}
                      disabled={!selectionRect || selectionRect.w < 10 || selectionRect.h < 10}
                      className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Crop className="w-4 h-4" /> Analisar área selecionada
                    </button>
                    <button
                      onClick={analyzeFullImage}
                      className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 text-body hover:bg-gray-50 dark:hover:bg-gray-800 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    >
                      <ZoomIn className="w-4 h-4" /> Analisar foto inteira
                    </button>
                    <button onClick={reset}
                      className="flex items-center gap-2 text-subtle hover:text-body text-sm px-3 py-2 rounded-xl transition-colors">
                      <Upload className="w-4 h-4" /> Outra foto
                    </button>
                  </div>
                </div>
              )}

              {/* Sem rosto */}
              {searchState === 'no-face' && (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                  <AlertTriangle className="w-12 h-12 text-yellow-500" />
                  <div>
                    <p className="text-title font-semibold">Nenhum rosto detectado</p>
                    <p className="text-subtle text-sm mt-1">Tente selecionar apenas a área do rosto ou use uma foto mais nítida.</p>
                  </div>
                  <button onClick={() => setSearchState('selecting')}
                    className="flex items-center gap-2 text-sm font-medium text-sigma-600 hover:text-sigma-700">
                    <Crop className="w-4 h-4" /> Tentar com seleção manual
                  </button>
                </div>
              )}

              {/* Detectando / buscando */}
              {(searchState === 'detecting' || searchState === 'searching') && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <Loader2 className="w-10 h-10 text-sigma-600 animate-spin" />
                  <p className="text-title font-semibold">
                    {searchState === 'detecting' ? 'Detectando rosto e extraindo descriptor...' : 'Comparando com o banco de dados...'}
                  </p>
                  {searchState === 'searching' && (
                    <p className="text-subtle text-sm">{totalIndexed.toLocaleString('pt-BR')} registros indexados</p>
                  )}
                </div>
              )}

              {/* Resultados */}
              {searchState === 'results' && queryURL && (
                <>
                  {/* Thumbnail + controles */}
                  <div className="flex gap-4 items-start">
                    <div className="relative flex-shrink-0 w-28 h-28">
                      <img ref={resultImgRef} src={queryURL} alt="Analisado"
                        className="w-full h-full object-cover rounded-xl border-2 border-sigma-400"
                        onLoad={() => {
                          if (resultCanvasRef.current && resultImgRef.current) {
                            resultCanvasRef.current.width = resultImgRef.current.clientWidth;
                            resultCanvasRef.current.height = resultImgRef.current.clientHeight;
                          }
                        }}
                      />
                      <canvas ref={resultCanvasRef} className="absolute inset-0 w-full h-full rounded-xl"
                        style={{ pointerEvents: 'none' }} />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className="text-sm font-bold text-title">Rosto detectado</p>
                        <p className="text-xs text-subtle">68 landmarks · descriptor 128 dims</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-subtle font-medium whitespace-nowrap">Similaridade mínima:</label>
                        <input type="range" min={0} max={90} value={minSimilarity}
                          onChange={(e) => setMinSimilarity(Number(e.target.value))}
                          className="flex-1 accent-sigma-600" />
                        <span className="text-xs font-bold text-sigma-600 w-8 text-right">{minSimilarity}%</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setSearchState('selecting')}
                          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                          <Crop className="w-3.5 h-3.5" /> Reselecionar área
                        </button>
                        <button onClick={reset}
                          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                          <Upload className="w-3.5 h-3.5" /> Nova foto
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 text-sm">
                    <span className="text-subtle">
                      <span className="font-bold text-title">{matches.length}</span> resultado{matches.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-subtle">·</span>
                    <span className="text-subtle">
                      <span className="font-bold text-title">{totalIndexed.toLocaleString('pt-BR')}</span> registros comparados
                    </span>
                  </div>

                  {matches.length === 0 ? (
                    <div className="flex flex-col items-center py-12 gap-3 text-center">
                      <CheckCircle className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                      <p className="text-title font-semibold">Nenhuma correspondência encontrada</p>
                      <p className="text-subtle text-sm">Tente reduzir o limite mínimo de similaridade ou indexar mais fotos.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {matches.map((m, i) => <MatchCard key={m.id} match={m} rank={i + 1} />)}
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
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Com foto', value: indexStatus.withPhoto, color: 'text-sigma-600' },
                    { label: 'Indexadas', value: indexStatus.indexed, color: 'text-green-600 dark:text-green-400' },
                    { label: 'Pendentes', value: indexStatus.remaining, color: indexStatus.remaining > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4 text-center">
                      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-subtle mt-1">{label}</p>
                    </div>
                  ))}
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
                    <span>
                      {indexProgress.errors.toLocaleString('pt-BR')} sem rosto / erro
                    </span>
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
                  <li>O browser carrega cada foto, detecta o rosto e calcula um descriptor de 128 dimensões.</li>
                  <li>{CONCURRENCY} fotos são processadas em paralelo para máxima velocidade.</li>
                  <li>Fotos sem rosto detectável são ignoradas (não reprocessadas).</li>
                  <li>Processamento contínuo — processa <strong>todas</strong> as fotos pendentes sem limite.</li>
                  <li>Pode ser interrompido e retomado a qualquer momento.</li>
                </ul>
              </div>

              <div className="flex gap-3">
                {!isIndexing ? (
                  <>
                    <button
                      onClick={startIndexing}
                      disabled={searchState === 'loading' || (indexStatus?.remaining ?? 1) === 0}
                      className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                      <Database className="w-4 h-4" />
                      {(indexStatus?.remaining ?? 1) === 0 ? 'Tudo indexado' : 'Iniciar indexação completa'}
                    </button>
                    <button onClick={fetchStatus}
                      className="flex items-center gap-2 text-sm font-medium text-sigma-600 hover:text-sigma-700 border border-sigma-200 dark:border-sigma-800 hover:bg-sigma-50 dark:hover:bg-sigma-900/20 px-4 py-2.5 rounded-xl transition-colors">
                      <RefreshCw className="w-4 h-4" /> Atualizar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { stopIndexRef.current = true; }}
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
    </div>
  );
}
