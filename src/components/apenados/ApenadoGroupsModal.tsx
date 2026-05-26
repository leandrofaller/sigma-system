'use client';

import { useState, useEffect } from 'react';
import { X, FolderOpen, Trash2, Users, ChevronDown, ChevronUp, AlertTriangle, Loader2 } from 'lucide-react';

interface GroupMember {
  apenadoId: string;
  similarity: number | null;
  addedAt: string;
  apenado: {
    id: string;
    name: string;
    matricula: string | null;
    unidade: string | null;
    photoPath: string | null;
  };
}

interface ApenadoGroup {
  id: string;
  name: string;
  description: string | null;
  baseApenadoId: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  members: GroupMember[];
}

interface Props {
  onClose: () => void;
  userRole: string;
}

export function ApenadoGroupsModal({ onClose, userRole }: Props) {
  const [groups, setGroups] = useState<ApenadoGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

  useEffect(() => {
    fetch('/api/apenados/groups')
      .then((r) => r.json())
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/apenados/groups/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setGroups((prev) => prev.filter((g) => g.id !== id));
        setConfirmDelete(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col"
        style={{ maxHeight: '88vh' }}
      >
        {/* Header */}
        <div className="gradient-sigma px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Grupos de Identificação</p>
              <p className="text-white/70 text-xs">
                {loading ? 'Carregando...' : `${groups.length} grupo${groups.length !== 1 ? 's' : ''} criado${groups.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-sigma-600 animate-spin" />
            </div>
          )}

          {!loading && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <FolderOpen className="w-12 h-12 text-gray-300 dark:text-gray-600" />
              <p className="text-title font-semibold">Nenhum grupo criado</p>
              <p className="text-subtle text-sm">
                Abra a foto de um apenado, faça a busca por indivíduo e selecione registros para criar um grupo.
              </p>
            </div>
          )}

          {!loading && groups.map((group) => {
            const isExpanded = expandedId === group.id;
            return (
              <div key={group.id} className="card overflow-hidden">
                {/* Group header row */}
                <div className="flex items-center gap-3 p-4">
                  <div className="w-9 h-9 bg-teal-100 dark:bg-teal-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-title text-sm truncate">{group.name}</p>
                    <p className="text-subtle text-xs">
                      {group.members.length} membro{group.members.length !== 1 ? 's' : ''}
                      {' · '}
                      {fmtDate(group.createdAt)}
                      {group.createdBy && ` · ${group.createdBy.name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isAdmin && (
                      <button
                        onClick={() => setConfirmDelete(group.id)}
                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Excluir grupo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : group.id)}
                      className="w-7 h-7 flex items-center justify-center text-subtle hover:text-body rounded-lg transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Members list */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {group.members.map((m) => (
                      <div key={m.apenadoId} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                          {m.apenado.photoPath ? (
                            <img
                              src={`/api/apenados/${m.apenado.id}/foto`}
                              alt={m.apenado.name}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-500 to-teal-700">
                              <span className="text-white text-xs font-bold">{m.apenado.name.charAt(0)}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-title truncate">{m.apenado.name}</p>
                          <p className="text-xs text-subtle truncate">
                            {[m.apenado.matricula, m.apenado.unidade].filter(Boolean).join(' · ') || 'Sem matrícula'}
                          </p>
                        </div>
                        {m.similarity != null && (
                          <span className={`text-xs font-bold tabular-nums flex-shrink-0 ${
                            m.similarity >= 85 ? 'text-green-600 dark:text-green-400'
                            : m.similarity >= 70 ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-gray-500'
                          }`}>
                            {m.similarity}%
                          </span>
                        )}
                        {group.baseApenadoId === m.apenado.id && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 flex-shrink-0">
                            base
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-red-200 dark:border-red-800 p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
              <p className="font-bold text-title">Excluir grupo?</p>
            </div>
            <p className="text-sm text-subtle">
              O grupo será excluído permanentemente. Os apenados membros não são afetados.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-subtle hover:text-body border border-gray-200 dark:border-gray-700 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={!!deletingId}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                {deletingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
