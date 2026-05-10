'use client';

import { useState } from 'react';
import { Database, Download, Trash2, Loader2, HardDrive, AlertCircle } from 'lucide-react';

interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupPanel({ initialBackups }: { initialBackups: BackupFile[] }) {
  const [backups, setBackups] = useState(initialBackups);
  const [creating, setCreating] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createBackup = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/backups', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Erro desconhecido');
      setBackups((prev) => [data, ...prev]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const deleteBackup = async (name: string) => {
    if (!confirm(`Excluir backup "${name}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingName(name);
    try {
      const res = await fetch(`/api/admin/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (res.ok) setBackups((prev) => prev.filter((b) => b.name !== name));
    } finally {
      setDeletingName(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="card p-4 flex-1 bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30">
          <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-0.5">Armazenamento</p>
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Os backups são salvos em <code className="font-mono text-xs bg-blue-100 dark:bg-blue-900/30 px-1 py-0.5 rounded">/app/uploads/backups/</code> e persistem no volume de dados do Coolify.
          </p>
        </div>
        <button
          onClick={createBackup}
          disabled={creating}
          className="flex-shrink-0 flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          {creating ? 'Gerando backup...' : 'Criar Backup Agora'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-title">Backups disponíveis</span>
          <span className="text-xs text-subtle">{backups.length} arquivo{backups.length !== 1 ? 's' : ''}</span>
        </div>

        {backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-subtle">
            <HardDrive className="w-10 h-10 text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-sm font-medium">Nenhum backup ainda</p>
            <p className="text-xs mt-1">Clique em "Criar Backup Agora" para gerar o primeiro</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left text-xs font-semibold text-subtle px-6 py-3">Arquivo</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-3">Tamanho</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-3">Criado em</th>
                <th className="text-right text-xs font-semibold text-subtle px-6 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {backups.map((backup) => (
                <tr key={backup.name} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-sigma-50 dark:bg-sigma-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Database className="w-4 h-4 text-sigma-600 dark:text-sigma-400" />
                      </div>
                      <span className="text-sm font-mono text-body">{backup.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-subtle">{formatSize(backup.size)}</td>
                  <td className="px-4 py-3.5 text-sm text-subtle whitespace-nowrap">
                    {new Date(backup.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/api/admin/backups/${encodeURIComponent(backup.name)}`}
                        download={backup.name}
                        className="p-1.5 text-gray-400 hover:text-sigma-600 dark:hover:text-sigma-400 hover:bg-sigma-50 dark:hover:bg-sigma-900/20 rounded-lg transition-colors"
                        title="Baixar backup"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => deleteBackup(backup.name)}
                        disabled={deletingName === backup.name}
                        className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40"
                        title="Excluir backup"
                      >
                        {deletingName === backup.name
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
