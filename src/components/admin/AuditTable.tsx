'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/utils';
import { Search, Download } from 'lucide-react';

interface Props {
  logs: any[];
}

const actionColors: Record<string, string> = {
  LOGIN:         'bg-green-50  dark:bg-green-900/20  text-green-700  dark:text-green-400',
  LOGOUT:        'bg-gray-50   dark:bg-gray-800      text-gray-600   dark:text-gray-400',
  CREATE_RELINT: 'bg-blue-50   dark:bg-blue-900/20   text-blue-700   dark:text-blue-400',
  EDIT_RELINT:   'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
  DELETE_RELINT: 'bg-red-50    dark:bg-red-900/20    text-red-700    dark:text-red-400',
  PUBLISH_RELINT:'bg-sigma-50  dark:bg-sigma-900/20  text-sigma-700  dark:text-sigma-400',
  UPLOAD_FILE:   'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400',
  CREATE_USER:   'bg-teal-50   dark:bg-teal-900/20   text-teal-700   dark:text-teal-400',
  AI_QUERY:      'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
  CHANGE_CONFIG: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400',
};

export function AuditTable({ logs }: Props) {
  const [search, setSearch] = useState('');

  const filtered = logs.filter((l) =>
    !search ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.entity?.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    const rows = [['Data/Hora', 'Usuário', 'Ação', 'Entidade', 'IP']];
    filtered.forEach((l) => {
      rows.push([formatDateTime(l.createdAt), l.user?.name || 'Sistema', l.action, l.entity || '', l.ipAddress || '']);
    });
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `auditoria_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por ação, usuário..."
            className="w-full pl-9 pr-4 py-2.5 input-base" />
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
                <th className="text-left text-xs font-semibold text-subtle px-6 py-4">Data/Hora</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Usuário</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Ação</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Entidade</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">IP</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-6 py-3 text-xs text-subtle font-mono whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-body">
                    {log.user?.name || <span className="text-subtle italic">Sistema</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${actionColors[log.action] || 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-subtle">{log.entity || '-'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-subtle">{log.ipAddress || '-'}</td>
                  <td className="px-4 py-3 text-xs text-subtle max-w-xs truncate">
                    {log.details ? JSON.stringify(log.details).substring(0, 60) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
