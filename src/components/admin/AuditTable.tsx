'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/utils';
import { Search, Download } from 'lucide-react';

interface Props {
  logs: any[];
}

const actionColors: Record<string, string> = {
  LOGIN: 'bg-green-50 text-green-700',
  LOGOUT: 'bg-gray-50 text-gray-600',
  CREATE_RELINT: 'bg-blue-50 text-blue-700',
  EDIT_RELINT: 'bg-yellow-50 text-yellow-700',
  DELETE_RELINT: 'bg-red-50 text-red-700',
  PUBLISH_RELINT: 'bg-sigma-50 text-sigma-700',
  UPLOAD_FILE: 'bg-purple-50 text-purple-700',
  CREATE_USER: 'bg-teal-50 text-teal-700',
  AI_QUERY: 'bg-orange-50 text-orange-700',
  CHANGE_CONFIG: 'bg-indigo-50 text-indigo-700',
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
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-sigma-400 bg-white" />
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="text-left text-xs font-semibold text-gray-500 px-6 py-4">Data/Hora</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Usuário</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Ação</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Entidade</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">IP</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {log.user?.name || <span className="text-gray-400 italic">Sistema</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${actionColors[log.action] || 'bg-gray-50 text-gray-600'}`}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{log.entity || '-'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-400">{log.ipAddress || '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">
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
