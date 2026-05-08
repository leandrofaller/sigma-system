'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FileText, Plus, Search, Filter, Eye, Pencil, Trash2, Download } from 'lucide-react';
import { formatDate, getClassificationColor } from '@/lib/utils';
import type { RelintWithRelations } from '@/types';

interface Props {
  relints: RelintWithRelations[];
  role: string;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  PUBLISHED: 'bg-green-50 text-green-700 border-green-200',
  ARCHIVED: 'bg-gray-50 text-gray-600 border-gray-200',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
};

export function RelintsList({ relints, role }: Props) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const filtered = relints.filter((r) => {
    const matchSearch = !search ||
      r.subject.toLowerCase().includes(search.toLowerCase()) ||
      r.number.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por assunto ou número..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-sigma-400 focus:ring-2 focus:ring-sigma-400/10 bg-white" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sigma-400 bg-white">
          <option value="">Todos os status</option>
          <option value="DRAFT">Rascunho</option>
          <option value="PUBLISHED">Publicado</option>
          <option value="ARCHIVED">Arquivado</option>
        </select>
        <Link href="/relints/novo"
          className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Novo RELINT
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="text-left text-xs font-semibold text-gray-500 px-6 py-4">Número</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Assunto</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Classificação</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Autor</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Data</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-6 py-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400 text-sm">
                    <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    Nenhum relatório encontrado
                  </td>
                </tr>
              )}
              {filtered.map((relint, i) => (
                <motion.tr key={relint.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-xs font-mono text-gray-600">{relint.number.split('/')[0]}</span>
                  </td>
                  <td className="px-4 py-4 max-w-xs">
                    <p className="text-sm font-medium text-gray-900 truncate">{relint.subject}</p>
                    <p className="text-xs text-gray-400">{relint.group?.name}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getClassificationColor(relint.classification)}`}>
                      {relint.classification}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full border font-medium ${statusColors[relint.status]}`}>
                      {statusLabels[relint.status]}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">{relint.author?.name}</td>
                  <td className="px-4 py-4 text-xs text-gray-400">{formatDate(relint.createdAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/relints/${relint.id}`}
                        className="p-1.5 text-gray-400 hover:text-sigma-600 hover:bg-sigma-50 rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                      </Link>
                      <Link href={`/relints/${relint.id}/editar`}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </Link>
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
