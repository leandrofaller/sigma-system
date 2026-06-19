'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, Search, Eye, Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { containsNormalized } from '@/lib/search';

interface Props {
  relatorios: any[];
  role: string;
  userId: string;
  userGroupId?: string | null;
  userGroupName?: string | null;
}

const statusColors: Record<string, string> = {
  DRAFT:     'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  PUBLISHED: 'bg-green-50  dark:bg-green-900/20  text-green-700  dark:text-green-400  border-green-200  dark:border-green-800',
  DELETION_REQUESTED: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 animate-pulse',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  DELETION_REQUESTED: 'Exclusão Pendente',
};

export function RelatoriosForcaTarefaList({ relatorios, role, userId, userGroupId, userGroupName }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string, status: string) => {
    const isRequested = status === 'DELETION_REQUESTED';
    const message = role === 'SUPER_ADMIN' || (role === 'ADMIN' && isRequested)
      ? 'Tem certeza que deseja excluir este relatório PERMANENTEMENTE?'
      : 'Solicitar a exclusão deste relatório? Um administrador precisará aprovar.';

    if (!window.confirm(message)) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/forca-tarefa/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao excluir');
      }
      router.refresh();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = relatorios.filter((r) => {
    const matchSearch = !search ||
      containsNormalized(r.number, search) ||
      containsNormalized(r.forcaTarefa, search) ||
      containsNormalized(r.author?.name || '', search);
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, força-tarefa ou servidor..."
            className="w-full pl-9 pr-4 py-2.5 input-base text-sm" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="input-base px-3 py-2.5 text-sm">
          <option value="">Todos os status</option>
          <option value="DRAFT">Rascunho</option>
          <option value="PUBLISHED">Publicado</option>
          <option value="DELETION_REQUESTED">Exclusão Pendente</option>
        </select>
        <Link href="/forca-tarefa/novo"
          className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Novo Relatório
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
                <th className="text-left text-xs font-semibold text-subtle px-6 py-4">Número</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Força-Tarefa / Período</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Risco</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Status</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Servidor</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Data Registro</th>
                <th className="text-right text-xs font-semibold text-subtle px-6 py-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-subtle text-sm">
                    <ClipboardList className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                    Nenhum relatório encontrado
                  </td>
                </tr>
              )}
              {filtered.map((rel, i) => {
                const risco = rel.content?.avaliacaoRisco?.classificacao || 'BAIXO';
                const riscoBadgeColors: Record<string, string> = {
                  BAIXO: 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400',
                  MÉDIO: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400',
                  ALTO: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400',
                  CRÍTICO: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
                };
                
                return (
                  <motion.tr key={rel.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className={`transition-colors ${
                      rel.status === 'DELETION_REQUESTED'
                        ? 'bg-red-50/60 dark:bg-red-900/15 border-l-4 border-l-red-500 hover:bg-red-50 dark:hover:bg-red-900/25'
                        : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/40'
                    }`}>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono text-body">{rel.number}</span>
                    </td>
                    <td className="px-4 py-4 max-w-xs">
                      <p className="text-sm font-semibold text-title truncate">{rel.forcaTarefa}</p>
                      <p className="text-[11px] text-subtle">
                        {formatDate(rel.periodoInicio)} a {formatDate(rel.periodoFim)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${riscoBadgeColors[risco.toUpperCase()] || 'bg-gray-100 text-gray-500'}`}>
                        {risco}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        {rel.status === 'DELETION_REQUESTED' && (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 animate-pulse" />
                        )}
                        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${statusColors[rel.status]}`}>
                          {statusLabels[rel.status]}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-body">{rel.content?.identificacao?.servidor || rel.author?.name}</p>
                      <p className="text-[10px] text-subtle uppercase">{rel.group?.name}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-subtle">{formatDate(rel.createdAt)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/forca-tarefa/${rel.id}`}
                          className="p-1.5 text-gray-400 hover:text-sigma-600 dark:hover:text-sigma-400 hover:bg-sigma-50 dark:hover:bg-sigma-900/20 rounded-lg transition-colors">
                          <Eye className="w-4 h-4" />
                        </Link>
                        {(() => {
                          const canModify = role === 'SUPER_ADMIN' || 
                                            role === 'ADMIN' || 
                                            rel.authorId === userId || 
                                            (rel.groupId === userGroupId && userGroupName !== 'NI/AIP/JI-PARANÁ');
                          return (
                            <>
                              {canModify && (
                                <Link href={`/forca-tarefa/${rel.id}/editar`}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                                  <Pencil className="w-4 h-4" />
                                </Link>
                              )}

                              {canModify && (
                                <button
                                  onClick={() => handleDelete(rel.id, rel.status)}
                                  disabled={deletingId === rel.id || (rel.status === 'DELETION_REQUESTED' && rel.authorId === userId && role !== 'SUPER_ADMIN' && role !== 'ADMIN')}
                                  title={rel.status === 'DELETION_REQUESTED' ? 'Aprovar Exclusão' : 'Excluir'}
                                  className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                                    rel.status === 'DELETION_REQUESTED'
                                      ? 'text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40'
                                      : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                                  }`}
                                >
                                  {deletingId === rel.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
