'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, ScanFace, Upload, Loader2, AlertTriangle, RefreshCw,
  Database, Search, CheckCircle, ChevronDown, ChevronUp,
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

type Tab = 'search' | 'index';
type SearchState = 'loading' | 'ready' | 'detecting' | 'searching' | 'results' | 'no-face' | 'error';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MODEL_URL = '/models/face-api';

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

// ─── Sub-component: resultado individual ─────────────────────────────────────

function MatchCard({ match, rank }: { match: FaceMatch; rank: number }) {
  const [expanded, setExpanded] = useState(rank <= 3);
  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${
      match.similarity >= 70
        ? 'border-green-200 dark:border-green-800'
        : match.similarity >= 45
          ? 'border-yellow-200 dark:border-yellow-800'
          : 'border-gray-200 dark:border-gray-700'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3 bg-gray-50/60 dark:bg-gray-800/50">
        {/* Rank */}
        <span className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-subtle flex-shrink-0">
          {rank}
        </span>

        {/* Photo */}
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
          {match.photoPath ? (
            <img
              src={`/api/apenados/${match.id}/foto`}
              alt={match.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ScanFace className="w-5 h-5 text-gray-400" />
            </div>
          )}
        </div>

        {/* Name + info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-title truncate">{match.name}</p>
          <p className="text-xs text-subtle truncate">
            {[match.matricula, match.unidade].filter(Boolean).join(' · ') || 'Sem matrícula'}
          </p>
          {match.faccao && (
            <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium mt-0.5">{match.faccao}</p>
          )}
        </div>

        {/* Similarity */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-xl font-black tabular-nums ${similarityColor(match.similarity)}`}>
            {match.similarity}%
          </span>
          <span className={`text-[10px] font-semibold ${similarityColor(match.similarity)}`}>
            {similarityLabel(match.similarity)}
          </span>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1 text-gray-400 hover:text-body transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Similarity bar */}
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800">
        <div
          className={`h-full transition-all ${similarityBg(match.similarity)}`}
          style={{ width: `${match.similarity}%` }}
        />
      </div>

      {/* Expanded: trait breakdown */}
      {expanded && (
        <div className="p-3 grid grid-cols-5 gap-1.5">
          {match.traits.map(({ name, similarity }) => (
            <div key={name} className="flex flex-col items-center gap-1">
              {/* Mini vertical bar */}
              <div className="w-full h-12 bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden flex items-end">
                <div
                  className={`w-full transition-all rounded-md ${similarityBg(similarity)}`}
                  style={{ height: `${similarity}%` }}
                />
              </div>
              <span className={`text-[10px] font-bold tabular-nums ${similarityColor(similarity)}`}>
                {similarity}%
              </span>
              <span className="text-[9px] text-subtle text-center leading-tight">{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  userRole: string;
}

export function FaceSearch({ onClose, userRole }: Props) {
  const [tab, setTab] = useState<Tab>('search');
  const [searchState, setSearchState] = useState<SearchState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [queryURL, setQueryURL] = useState<string | null>(null);
  const [matches, setMatches] = useState<FaceMatch[]>([]);
  const [totalIndexed, setTotalIndexed] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [minSimilarity, setMinSimilarity] = useState(30);

  // Indexação
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0, errors: 0, faces: 0 });
  const stopIndexRef = useRef(false);

  const faceapiRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carrega modelos
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
      } catch (err: any) {
        setErrorMsg('Falha ao carregar modelos. Execute: node scripts/setup-face-models.js');
        setSearchState('error');
      }
    })();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/apenados/face/status');
      setIndexStatus(await res.json());
    } catch {}
  };

  // Processa imagem e busca
  const processImage = useCallback(async (file: File) => {
    const fa = faceapiRef.current;
    if (!fa || !file.type.startsWith('image/')) return;

    const url = URL.createObjectURL(file);
    setQueryURL(url);
    setMatches([]);
    setSearchState('detecting');

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Falha ao carregar imagem'));
        img.src = url;
      });

      const detection = await fa
        .detectSingleFace(img, new fa.SsdMobilenetv1Options({ minConfidence: 0.4 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setSearchState('no-face');
        return;
      }

      // Desenha landmarks + bounding box
      if (canvasRef.current && imgRef.current) {
        const dims = fa.matchDimensions(canvasRef.current, imgRef.current);
        const resized = fa.resizeResults(detection, dims);
        const ctx = canvasRef.current.getContext('2d')!;
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        fa.draw.drawFaceLandmarks(canvasRef.current, resized);
        // Bounding box manual (cor personalizada)
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

  // Indexação em lote
  const startIndexing = useCallback(async () => {
    const fa = faceapiRef.current;
    if (!fa || isIndexing) return;
    setIsIndexing(true);
    stopIndexRef.current = false;

    const idsRes = await fetch('/api/apenados/face/unindexed?limit=500');
    const { ids }: { ids: string[] } = await idsRes.json();

    setIndexProgress({ current: 0, total: ids.length, errors: 0, faces: 0 });

    for (let i = 0; i < ids.length; i++) {
      if (stopIndexRef.current) break;

      const id = ids[i];
      let ok = false;

      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = `/api/apenados/${id}/foto?t=${Date.now()}`;
        });

        if (img.naturalWidth === 0) {
          setIndexProgress((p) => ({ ...p, current: i + 1, errors: p.errors + 1 }));
          continue;
        }

        const detection = await fa
          .detectSingleFace(img, new fa.SsdMobilenetv1Options({ minConfidence: 0.4 }))
          .withFaceDescriptor();

        if (detection) {
          const descriptor = Array.from(detection.descriptor as Float32Array);
          await fetch(`/api/apenados/${id}/face`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descriptor }),
          });
          ok = true;
        }
      } catch {}

      setIndexProgress((p) => ({
        ...p,
        current: i + 1,
        faces: ok ? p.faces + 1 : p.faces,
        errors: ok ? p.errors : p.errors + 1,
      }));
    }

    setIsIndexing(false);
    fetchStatus();
  }, [isIndexing]);

  // Drag-and-drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processImage(file);
  }, [processImage]);

  const reset = () => {
    setSearchState('ready');
    setQueryURL(null);
    setMatches([]);
    setErrorMsg('');
  };

  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

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
                  : 'Carregando modelos...'}
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
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === key
                    ? 'border-sigma-600 text-sigma-600 dark:text-sigma-400'
                    : 'border-transparent text-subtle hover:text-body'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Tab: Buscar ────────────────────────────────────────── */}
          {tab === 'search' && (
            <>
              {/* Carregando modelos */}
              {searchState === 'loading' && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <Loader2 className="w-10 h-10 text-sigma-600 animate-spin" />
                  <p className="text-title font-semibold">Carregando modelos de IA...</p>
                  <p className="text-subtle text-sm">SSD MobileNet · Face Landmark 68 · Face Recognition (~12 MB)</p>
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

              {/* Upload zone (ready / no-face) */}
              {(searchState === 'ready' || searchState === 'no-face') && !queryURL && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-sigma-400 bg-sigma-50 dark:bg-sigma-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-sigma-300 hover:bg-sigma-50/50 dark:hover:bg-sigma-900/10'
                  }`}
                >
                  <Upload className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-title font-semibold">Arraste uma foto ou clique para selecionar</p>
                  <p className="text-subtle text-sm mt-1">JPG, PNG, WEBP · O rosto deve ser visível</p>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) processImage(f); }} />
                </div>
              )}

              {/* Sem rosto detectado */}
              {searchState === 'no-face' && queryURL && (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                  <AlertTriangle className="w-12 h-12 text-yellow-500" />
                  <div>
                    <p className="text-title font-semibold">Nenhum rosto detectado</p>
                    <p className="text-subtle text-sm mt-1">Tente uma foto com o rosto mais visível e bem iluminado.</p>
                  </div>
                  <button onClick={reset} className="flex items-center gap-2 text-sm font-medium text-sigma-600 hover:text-sigma-700">
                    <Upload className="w-4 h-4" /> Tentar outra foto
                  </button>
                </div>
              )}

              {/* Detectando / buscando */}
              {(searchState === 'detecting' || searchState === 'searching') && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <Loader2 className="w-10 h-10 text-sigma-600 animate-spin" />
                  <p className="text-title font-semibold">
                    {searchState === 'detecting' ? 'Detectando rosto e extraindo descriptor...' : 'Comparando com banco de dados...'}
                  </p>
                  <p className="text-subtle text-sm">
                    {searchState === 'searching' && `${totalIndexed.toLocaleString('pt-BR')} registros indexados`}
                  </p>
                </div>
              )}

              {/* Resultados */}
              {searchState === 'results' && queryURL && (
                <>
                  {/* Query image com landmarks */}
                  <div className="flex gap-4 items-start">
                    <div className="relative flex-shrink-0">
                      <img
                        ref={imgRef}
                        src={queryURL}
                        alt="Foto analisada"
                        className="w-36 h-36 object-cover rounded-xl border-2 border-sigma-400"
                        onLoad={() => {
                          if (canvasRef.current && imgRef.current) {
                            canvasRef.current.width = imgRef.current.naturalWidth;
                            canvasRef.current.height = imgRef.current.naturalHeight;
                          }
                        }}
                      />
                      <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full rounded-xl"
                        style={{ pointerEvents: 'none' }}
                      />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className="text-sm font-bold text-title">Rosto detectado</p>
                        <p className="text-xs text-subtle mt-0.5">Landmarks de 68 pontos extraídos · descriptor 128 dims</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-subtle font-medium whitespace-nowrap">
                          Similaridade mínima:
                        </label>
                        <input
                          type="range" min={0} max={90} value={minSimilarity}
                          onChange={(e) => setMinSimilarity(Number(e.target.value))}
                          className="flex-1 accent-sigma-600"
                        />
                        <span className="text-xs font-bold text-sigma-600 w-8 text-right">{minSimilarity}%</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={reset}
                          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" /> Nova foto
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Estatísticas */}
                  <div className="flex gap-3 text-sm">
                    <span className="text-subtle">
                      <span className="font-bold text-title">{matches.length}</span> resultado{matches.length !== 1 ? 's' : ''} encontrado{matches.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-subtle">·</span>
                    <span className="text-subtle">
                      <span className="font-bold text-title">{totalIndexed.toLocaleString('pt-BR')}</span> registros comparados
                    </span>
                  </div>

                  {/* Lista de matches */}
                  {matches.length === 0 ? (
                    <div className="flex flex-col items-center py-12 gap-3 text-center">
                      <CheckCircle className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                      <p className="text-title font-semibold">Nenhuma correspondência encontrada</p>
                      <p className="text-subtle text-sm">Tente reduzir o limite mínimo de similaridade.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {matches.map((m, i) => (
                        <MatchCard key={m.id} match={m} rank={i + 1} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Tab: Indexar ────────────────────────────────────────── */}
          {tab === 'index' && (
            <div className="space-y-5">
              {indexStatus && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Com foto', value: indexStatus.withPhoto, color: 'text-sigma-600' },
                    { label: 'Indexadas', value: indexStatus.indexed, color: 'text-green-600 dark:text-green-400' },
                    { label: 'Pendentes', value: indexStatus.remaining, color: indexStatus.remaining > 0 ? 'text-yellow-600' : 'text-green-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4 text-center">
                      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-subtle mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Barra de progresso */}
              {(isIndexing || indexProgress.total > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-subtle">
                    <span>{indexProgress.current} / {indexProgress.total} processados</span>
                    <span>{indexProgress.faces} rostos · {indexProgress.errors} sem rosto/erro</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sigma-600 transition-all duration-300 rounded-full"
                      style={{ width: indexProgress.total > 0 ? `${(indexProgress.current / indexProgress.total) * 100}%` : '0%' }}
                    />
                  </div>
                  {!isIndexing && indexProgress.current === indexProgress.total && indexProgress.total > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">Lote concluído.</p>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-4 text-sm text-yellow-800 dark:text-yellow-300 space-y-1">
                <p className="font-semibold">Como funciona:</p>
                <ul className="list-disc pl-4 space-y-1 text-xs">
                  <li>O browser carrega cada foto, detecta o rosto e calcula um descriptor de 128 dimensões.</li>
                  <li>Se nenhum rosto for encontrado na foto, ela é ignorada.</li>
                  <li>Processa até 500 fotos por lote — execute novamente para continuar.</li>
                  <li>Fotos já indexadas não serão reprocessadas.</li>
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
                      {(indexStatus?.remaining ?? 1) === 0 ? 'Tudo indexado' : 'Iniciar indexação'}
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
                    <X className="w-4 h-4" /> Parar
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
