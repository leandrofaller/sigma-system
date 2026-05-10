'use client';

import { useState } from 'react';
import {
  Database, Download, Trash2, Loader2, HardDrive,
  AlertCircle, Cloud, CloudOff, CloudUpload, CheckCircle2, FolderArchive, FileCode2,
} from 'lucide-react';
import type { CloudEntry, CloudProvider } from '@/lib/cloud-backup';

interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

interface Props {
  initialBackups: BackupFile[];
  initialCloudIndex: Record<string, CloudEntry>;
  cloudProvider: CloudProvider;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const providerLabel: Record<CloudProvider, string> = {
  none: 'Sem nuvem',
  google_drive: 'Google Drive',
  onedrive: 'OneDrive',
};

const providerColor: Record<CloudProvider, string> = {
  none: 'text-gray-500',
  google_drive: 'text-blue-600 dark:text-blue-400',
  onedrive: 'text-sky-600 dark:text-sky-400',
};

export function BackupPanel({ initialBackups, initialCloudIndex, cloudProvider }: Props) {
  const [backups, setBackups] = useState(initialBackups);
  const [cloudIndex, setCloudIndex] = useState(initialCloudIndex);
  const [creating, setCreating] = useState(false);
  const [creatingZip, setCreatingZip] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudWarning, setCloudWarning] = useState<string | null>(null);

  const createBackup = async () => {
    setCreating(true);
    setError(null);
    setCloudWarning(null);
    try {
      const res = await fetch('/api/admin/backups', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Erro desconhecido');

      setBackups((prev) => [{ name: data.name, size: data.size, createdAt: data.createdAt }, ...prev]);

      if (data.cloudId) {
        setCloudIndex((prev) => ({
          ...prev,
          [data.name]: { cloudId: data.cloudId, provider: cloudProvider, uploadedAt: new Date().toISOString() },
        }));
      } else if (data.cloudError) {
        setCloudWarning(`Backup criado localmente, mas o envio para a nuvem falhou: ${data.cloudError}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const uploadToCloud = async (name: string) => {
    setUploadingName(name);
    setCloudWarning(null);
    try {
      const res = await fetch(`/api/admin/backups/${encodeURIComponent(name)}`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar para nuvem');
      setCloudIndex((prev) => ({
        ...prev,
        [name]: { cloudId: data.cloudId, provider: data.provider, uploadedAt: new Date().toISOString() },
      }));
    } catch (e: any) {
      setCloudWarning(`Falha ao enviar "${name}": ${e.message}`);
    } finally {
      setUploadingName(null);
    }
  };

  const createZipBackup = async () => {
    setCreatingZip(true);
    setError(null);
    setCloudWarning(null);
    try {
      const res = await fetch('/api/admin/backups/zip', { method: 'POST' });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { throw new Error(`Resposta inválida do servidor: ${text.slice(0, 200)}`); }
      if (!res.ok) throw new Error(data.detail || data.error || 'Erro ao gerar ZIP');
      setBackups((prev) => [{ name: data.name, size: data.size, createdAt: data.createdAt }, ...prev]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreatingZip(false);
    }
  };

  const deleteBackup = async (name: string) => {
    if (!confirm(`Excluir backup "${name}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingName(name);
    try {
      const res = await fetch(`/api/admin/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (res.ok) {
        setBackups((prev) => prev.filter((b) => b.name !== name));
        setCloudIndex((prev) => { const n = { ...prev }; delete n[name]; return n; });
      }
    } finally {
      setDeletingName(null);
    }
  };

  const hasCloud = cloudProvider !== 'none';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="card px-4 py-3 flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800/60">
            {hasCloud ? (
              <Cloud className={`w-4 h-4 ${providerColor[cloudProvider]}`} />
            ) : (
              <CloudOff className="w-4 h-4 text-gray-400" />
            )}
            <div>
              <p className="text-xs font-semibold text-title leading-none">
                {providerLabel[cloudProvider]}
              </p>
              <p className="text-xs text-subtle mt-0.5">
                {hasCloud ? 'Backups enviados automaticamente' : 'Configure um provedor em Configurações'}
              </p>
            </div>
          </div>
          <div className="card px-4 py-3 flex items-center gap-2.5 bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30">
            <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-xs text-blue-800 dark:text-blue-300">
              Armazenamento local:{' '}
              <code className="font-mono bg-blue-100 dark:bg-blue-900/30 px-1 py-0.5 rounded">/uploads/backups/</code>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={createZipBackup}
            disabled={creatingZip}
            className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 text-body px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            title="Gera um ZIP com todos os arquivos enviados (imagens, documentos, anexos)"
          >
            {creatingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderArchive className="w-4 h-4" />}
            {creatingZip ? 'Compactando...' : 'Backup de Arquivos (ZIP)'}
          </button>
          <button
            onClick={createBackup}
            disabled={creating}
            className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {creating ? 'Gerando backup...' : 'Backup do Banco (SQL)'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {cloudWarning && (
        <div className="flex items-start gap-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400 text-sm px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{cloudWarning}</span>
        </div>
      )}

      {/* Tabela */}
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
                {hasCloud && (
                  <th className="text-left text-xs font-semibold text-subtle px-4 py-3">Nuvem</th>
                )}
                <th className="text-right text-xs font-semibold text-subtle px-6 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {backups.map((backup) => {
                const cloud = cloudIndex[backup.name];
                return (
                  <tr key={backup.name} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        {backup.name.endsWith('.zip') ? (
                          <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                            <FolderArchive className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-sigma-50 dark:bg-sigma-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                            <FileCode2 className="w-4 h-4 text-sigma-600 dark:text-sigma-400" />
                          </div>
                        )}
                        <div>
                          <span className="text-sm font-mono text-body">{backup.name}</span>
                          <p className="text-xs text-subtle">{backup.name.endsWith('.zip') ? 'Arquivos (ZIP)' : 'Banco de dados (SQL)'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-subtle">{formatSize(backup.size)}</td>
                    <td className="px-4 py-3.5 text-sm text-subtle whitespace-nowrap">
                      {new Date(backup.createdAt).toLocaleString('pt-BR')}
                    </td>
                    {hasCloud && (
                      <td className="px-4 py-3.5">
                        {cloud ? (
                          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-xs font-medium">{providerLabel[cloud.provider]}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Não sincronizado</span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {hasCloud && !cloud && (
                          <button
                            onClick={() => uploadToCloud(backup.name)}
                            disabled={uploadingName === backup.name}
                            title={`Enviar para ${providerLabel[cloudProvider]}`}
                            className="p-1.5 text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors disabled:opacity-40"
                          >
                            {uploadingName === backup.name
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <CloudUpload className="w-4 h-4" />
                            }
                          </button>
                        )}
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
