'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, Search, Eye, Pencil, Trash2, Loader2 } from 'lucide-react';
import { formatDate, getClassificationColor } from '@/lib/utils';
import type { DebriefingWithRelations } from '@/types';

interface Props {
  debriefings: DebriefingWithRelations[];
  role: string;
  userId: string;
}

const statusColors: Record<string, string> = {
  DRAFT:     'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  PUBLISHED: 'bg-green-50  dark:bg-green-900/20  text-green-700  dark:text-green-400  border-green-200  dark:border-green-800',
  ARCHIVED:  'bg-gray-50   dark:bg-gray-800      text-gray-600   dark:text-gray-400   border-gray-200   dark:border-gray-700',
  DELETION_REQUESTED: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 animate-pulse',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Rascunho', PUBLISHED: 'Publicado', ARCHIVED: 'Arquivado', DELETION_REQUESTED: 'Exclusão Pendente',
};

export function DebriefingsList({ debriefings, role, userId }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string, status: string) => {
    const isRequested = status === 'DELETION_REQUESTED';
    const message = role === 'SUPER_ADMIN' || (role === 'ADMIN' && isRequested)
      ? 'Tem certeza que deseja excluir este debriefing PERMANENTEMENTE?'
      : 'Solicitar a exclusão deste debriefing? Um administrador precisará aprovar.';

    if (!window.confirm(message)) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/debriefings/${id}`, { method: 'DELETE' });
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

  const filtered = debriefings.filter((d) => {
    const matchSearch = !search ||
      d.subject.toLowerCase().includes(search.toLowerCase()) ||
      d.number.toLowerCase().includes(search.toLowerCase()) ||
      (d.missionCode ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por assunto, número ou código de missão..."
            className="w-full pl-9 pr-4 py-2.5 input-base" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="input-base px-3 py-2.5">
          <option value="">Todos os status</option>
          <option value="DRAFT">Rascunho</option>
          <option value="PUBLISHED">Publicado</option>
          <option value="ARCHIVED">Arquivado</option>
          <option value="DELETION_REQUESTED">Exclusão Pendente</option>
        </select>
        <Link href="/debriefings/novo"
          className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Novo Debriefing
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
                <th className="text-left text-xs font-semibold text-subtle px-6 py-4">Número</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Assunto / Missão</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Tipo de Operação</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Classificação</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Status</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Autor</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Data</th>
                <th className="text-right text-xs font-semibold text-subtle px-6 py-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-subtle text-sm">
                    <ClipboardList className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                    Nenhum debriefing encontrado
                  </td>
                </tr>
              )}
              {filtered.map((d, i) => (
                <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-xs font-mono text-body">{d.number.split('/')[0]}</span>
                  </td>
                  <td className="px-4 py-4 max-w-xs">
                    <p className="text-sm font-medium text-title truncate">{d.subject}</p>
                    <p className="text-xs text-subtle">{d.missionCode ? `Cód: ${d.missionCode}` : d.group?.name}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs text-body">{d.operationType || '—'}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getClassificationColor(d.classification)}`}>
                      {d.classification}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full border font-medium ${statusColors[d.status]}`}>
                      {statusLabels[d.status]}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-body">{d.author?.name}</td>
                  <td className="px-4 py-4 text-xs text-subtle">{formatDate(d.createdAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/debriefings/${d.id}`}
                        className="p-1.5 text-gray-400 hover:text-sigma-600 dark:hover:text-sigma-400 hover:bg-sigma-50 dark:hover:bg-sigma-900/20 rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                      </Link>
                      <Link href={`/debriefings/${d.id}/editar`}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </Link>

                      {(role === 'SUPER_ADMIN' || role === 'ADMIN' || d.authorId === userId) && (
                        <button
                          onClick={() => handleDelete(d.id, d.status)}
                          disabled={deletingId === d.id || (d.status === 'DELETION_REQUESTED' && d.authorId === userId && role !== 'SUPER_ADMIN' && role !== 'ADMIN')}
                          title={d.status === 'DELETION_REQUESTED' ? 'Aprovar Exclusão' : 'Excluir'}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                            d.status === 'DELETION_REQUESTED'
                              ? 'text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40'
                              : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                          }`}
                        >
                          {deletingId === d.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
