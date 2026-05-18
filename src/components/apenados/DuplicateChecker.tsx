'use client';

import { useState, useCallback } from 'react';
import {
  X, ScanSearch, Loader2, Trash2, AlertTriangle, CheckCircle,
  RefreshCw, Users, Fingerprint, Waves,
} from 'lucide-react';

// Registro comum aos dois modos (exato não tem photoHash)
interface DisplayRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
}

// Resultado do modo "Semelhantes" (dHash)
interface SimilarResult {
  groups: DisplayRecord[][];
  totalAnalyzed: number;
  totalGroups: number;
  remaining: number;
  indexedThisRun: number;
}

// Resultado do modo "Exatas" (SHA-256 via Python ou Node.js)
interface ExactResult {
  groups: DisplayRecord[][];
  totalFiles: number;
  totalGroups: number;
  errors: string[];
  method: 'python' | 'nodejs';
}

type Mode = 'similar' | 'exact';
type Status = 'idle' | 'loading' | 'done' | 'error';

interface Props {
  onClose: () => void;
  onPhotoDeleted: (id: string) => void;
}

const MODES: { key: Mode; label: string; icon: typeof ScanSearch; description: string }[] = [
  {
    key: 'similar',
    label: 'Semelhantes',
    icon: Waves,
    description: 'Hash perceptual (dHash + LSH) — detecta fotos visualmente similares, mesmo com compressões diferentes.',
  },
  {
    key: 'exact',
    label: 'Exatamente iguais',
    icon: Fingerprint,
    description: 'Hash SHA-256 via Python — detecta arquivos byte a byte idênticos, com 100% de precisão.',
  },
];

export function DuplicateChecker({ onClose, onPhotoDeleted }: Props) {
  const [mode, setMode] = useState<Mode>('similar');
  const [status, setStatus] = useState<Status>('idle');
  const [similarResult, setSimilarResult] = useState<SimilarResult | null>(null);
  const [exactResult, setExactResult] = useState<ExactResult | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState('');

  const runCheck = useCallback(async (forceMode?: Mode) => {
    const m = forceMode ?? mode;
    setStatus('loading');
    setErrorMsg('');
    try {
      const endpoint = m === 'exact'
        ? '/api/apenados/exact-duplicates'
        : '/api/apenados/duplicates';
      const res = await fetch(endpoint);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      const data = await res.json();
      if (m === 'exact') setExactResult(data);
      else setSimilarResult(data);
      setStatus('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro desconhecido.');
      setStatus('error');
    }
  }, [mode]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setStatus('idle');
    setErrorMsg('');
  };

  const handleDeletePhoto = async (record: DisplayRecord) => {
    if (!confirm(`Remover foto de "${record.name}"? O registro será mantido.`)) return;
    setDeletingId(record.id);
    try {
      const res = await fetch(`/api/apenados/${record.id}/foto`, { method: 'DELETE' });
      if (!res.ok) { alert('Erro ao remover foto.'); return; }
      setDeletedIds((prev) => new Set([...prev, record.id]));
      onPhotoDeleted(record.id);
    } finally {
      setDeletingId(null);
    }
  };

  const activeGroups = (mode === 'exact' ? exactResult?.groups : similarResult?.groups)
    ?.map((g) => g.filter((r) => !deletedIds.has(r.id)))
    .filter((g) => g.length >= 2) ?? [];

  const currentMode = MODES.find((m) => m.key === mode)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="gradient-sigma px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <ScanSearch className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Verificação de Duplicatas</p>
              <p className="text-white/70 text-xs">{currentMode.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => switchMode(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                mode === key
                  ? 'border-sigma-600 text-sigma-600 dark:text-sigma-400'
                  : 'border-transparent text-subtle hover:text-body'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Idle */}
          {status === 'idle' && (
            <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
              <div className="w-20 h-20 bg-sigma-50 dark:bg-sigma-900/20 rounded-full flex items-center justify-center">
                <currentMode.icon className="w-10 h-10 text-sigma-500" />
              </div>
              <div>
                <p className="text-title font-semibold text-lg">
                  {mode === 'exact' ? 'Detectar fotos exatamente iguais' : 'Detectar fotos similares'}
                </p>
                <p className="text-subtle text-sm mt-1 max-w-sm">
                  {currentMode.description}
                </p>
                {mode === 'exact' && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2 max-w-sm">
                    Requer Python 3 instalado no servidor.
                  </p>
                )}
              </div>
              <button
                onClick={() => runCheck()}
                className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors shadow-lg shadow-sigma-600/20"
              >
                <currentMode.icon className="w-4 h-4" /> Iniciar verificação
              </button>
            </div>
          )}

          {/* Loading */}
          {status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <Loader2 className="w-12 h-12 text-sigma-600 animate-spin" />
              <div>
                <p className="text-title font-semibold">Analisando fotos...</p>
                <p className="text-subtle text-sm mt-1">
                  {mode === 'exact'
                    ? 'Calculando SHA-256 de cada arquivo via Python'
                    : 'Indexando e comparando hashes perceptuais'}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <AlertTriangle className="w-12 h-12 text-red-500" />
              <div>
                <p className="text-title font-semibold">Erro na verificação</p>
                {errorMsg && (
                  <p className="text-sm text-red-500 dark:text-red-400 mt-1 max-w-sm">{errorMsg}</p>
                )}
              </div>
              <button
                onClick={() => runCheck()}
                className="flex items-center gap-2 text-sm font-medium text-sigma-600 hover:text-sigma-700"
              >
                <RefreshCw className="w-4 h-4" /> Tentar novamente
              </button>
            </div>
          )}

          {/* Results */}
          {status === 'done' && (
            <div className="space-y-5">
              {/* Summary cards */}
              {mode === 'similar' && similarResult && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Fotos analisadas', value: similarResult.totalAnalyzed.toLocaleString('pt-BR'), color: 'text-sigma-600' },
                    { label: 'Grupos duplicados', value: activeGroups.length.toLocaleString('pt-BR'), color: activeGroups.length > 0 ? 'text-red-600' : 'text-green-600' },
                    { label: 'Aguardando índice', value: similarResult.remaining.toLocaleString('pt-BR'), color: similarResult.remaining > 0 ? 'text-yellow-600' : 'text-green-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4 text-center">
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-subtle mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              {mode === 'exact' && exactResult && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Arquivos verificados', value: exactResult.totalFiles.toLocaleString('pt-BR'), color: 'text-sigma-600' },
                      { label: 'Grupos idênticos', value: activeGroups.length.toLocaleString('pt-BR'), color: activeGroups.length > 0 ? 'text-red-600' : 'text-green-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="card p-4 text-center">
                        <p className={`text-2xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-subtle mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium w-fit ${
                    exactResult.method === 'python'
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    <Fingerprint className="w-3.5 h-3.5" />
                    SHA-256 via {exactResult.method === 'python' ? 'Python' : 'Node.js (Python não encontrado)'}
                  </div>
                </>
              )}

              {/* Erros do script Python */}
              {mode === 'exact' && exactResult && exactResult.errors.length > 0 && (
                <div className="flex items-start gap-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                      {exactResult.errors.length} arquivo(s) com erro de leitura
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {exactResult.errors.slice(0, 5).map((e, i) => (
                        <li key={i} className="text-xs text-yellow-700 dark:text-yellow-400 font-mono">{e}</li>
                      ))}
                      {exactResult.errors.length > 5 && (
                        <li className="text-xs text-yellow-600">...e mais {exactResult.errors.length - 5}</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {/* Aviso de fotos sem índice (modo similar) */}
              {mode === 'similar' && similarResult && similarResult.remaining > 0 && (
                <div className="flex items-start gap-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                      {similarResult.remaining.toLocaleString('pt-BR')} fotos ainda sem índice
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                      Execute novamente para indexar mais. São processadas até <strong>300 por execução</strong>.
                    </p>
                  </div>
                  <button
                    onClick={() => runCheck()}
                    className="flex items-center gap-1.5 text-xs font-semibold text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/40 hover:bg-yellow-200 dark:hover:bg-yellow-900/60 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Continuar
                  </button>
                </div>
              )}

              {/* Sem duplicatas */}
              {activeGroups.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <CheckCircle className="w-14 h-14 text-green-500" />
                  <p className="text-title font-semibold">Nenhuma duplicata encontrada</p>
                  <p className="text-subtle text-sm">
                    {mode === 'exact'
                      ? `Todos os ${(exactResult?.totalFiles ?? 0).toLocaleString('pt-BR')} arquivos são únicos.`
                      : `Todas as ${(similarResult?.totalAnalyzed ?? 0).toLocaleString('pt-BR')} fotos são únicas.`}
                  </p>
                </div>
              )}

              {/* Grupos duplicados */}
              {activeGroups.map((group, gi) => (
                <div key={gi} className="border border-red-200 dark:border-red-800 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
                    <Users className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                      Grupo {gi + 1} — {group.length} registros com foto{' '}
                      {mode === 'exact' ? 'idêntica' : 'similar'}
                    </span>
                    {mode === 'exact' && (
                      <span className="ml-auto text-[10px] font-mono bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                        SHA-256 idêntico
                      </span>
                    )}
                  </div>
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {group.map((record) => {
                      const isDeleting = deletingId === record.id;
                      return (
                        <div
                          key={record.id}
                          className="relative rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-800/50 flex flex-col"
                        >
                          <div className="aspect-square bg-gray-200 dark:bg-gray-700 relative overflow-hidden">
                            {record.photoPath ? (
                              <img
                                src={`/api/apenados/${record.id}/foto`}
                                alt={record.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="text-2xl font-bold text-gray-400">
                                  {record.name.charAt(0)}
                                </span>
                              </div>
                            )}
                            {isDeleting && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 text-white animate-spin" />
                              </div>
                            )}
                          </div>
                          <div className="p-2 flex-1 space-y-1">
                            <p className="text-xs font-semibold text-title truncate">{record.name}</p>
                            {record.matricula && (
                              <p className="text-[10px] text-subtle font-mono">{record.matricula}</p>
                            )}
                            {record.unidade && (
                              <p className="text-[10px] text-body truncate">{record.unidade}</p>
                            )}
                            {record.faccao && (
                              <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium truncate">
                                {record.faccao}
                              </p>
                            )}
                          </div>
                          {record.photoPath && (
                            <button
                              onClick={() => handleDeletePhoto(record)}
                              disabled={isDeleting}
                              className="flex items-center gap-1 justify-center text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 border-t border-gray-100 dark:border-gray-800 px-2 py-2 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" /> Remover foto
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {status === 'done' && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-subtle">
              {mode === 'exact'
                ? `SHA-256 (${exactResult?.method === 'python' ? 'Python' : 'Node.js'}) · ${(exactResult?.totalFiles ?? 0).toLocaleString('pt-BR')} arquivos verificados`
                : `dHash + LSH · threshold ≤10 bits · ${similarResult?.indexedThisRun ? `${similarResult.indexedThisRun} indexadas agora` : 'índice completo'}`}
            </p>
            <button
              onClick={() => runCheck()}
              className="flex items-center gap-2 text-sm font-medium text-sigma-600 hover:text-sigma-700 border border-sigma-200 dark:border-sigma-800 hover:bg-sigma-50 dark:hover:bg-sigma-900/20 px-4 py-2 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Verificar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
