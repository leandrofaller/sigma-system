'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, File, Search, Loader2, X, Download, Eye,
  Building2, ChevronDown, FolderOpen, Folder,
  Trash2, Pencil, Check, Plus, FolderX, MoreVertical,
} from 'lucide-react';
import { formatDate, formatFileSize, getClassificationColor } from '@/lib/utils';

interface RRFolder { id: string; name: string }

interface Props {
  files: any[];
  groups: any[];
  folders: RRFolder[];
  userId: string;
  role: string;
}

export function ReceivedRelintsList({ files: initialFiles, groups, folders: initialFolders, userId, role }: Props) {
  const [files, setFiles] = useState(initialFiles);
  const [folders, setFolders] = useState(initialFolders);
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState<string>('all');
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', groupId: '', folderId: '', notes: '', classification: 'RESERVADO' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => { if (accepted[0]) setSelectedFile(accepted[0]); },
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.png'], 'application/msword': ['.doc', '.docx'] },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!selectedFile || !form.title) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      const res = await fetch('/api/received-relints', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Erro ao importar arquivo.'); return; }
      setFiles((prev) => [data, ...prev]);
      setShowForm(false);
      setSelectedFile(null);
      setForm({ title: '', groupId: '', folderId: '', notes: '', classification: 'RESERVADO' });
    } catch { alert('Erro ao conectar ao servidor.'); }
    finally { setUploading(false); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch('/api/received-relints/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim() }),
    });
    if (res.ok) {
      const folder = await res.json();
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  const handleRenameFolder = async (id: string) => {
    if (!renameName.trim()) return;
    const res = await fetch(`/api/received-relints/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameName.trim() }),
    });
    if (res.ok) {
      setFolders((prev) => prev.map((f) => f.id === id ? { ...f, name: renameName.trim() } : f));
      setRenamingId(null);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Excluir esta pasta? Os arquivos serão movidos para "Sem pasta".')) return;
    const res = await fetch(`/api/received-relints/folders/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setFiles((prev) => prev.map((f) => f.folderId === id ? { ...f, folderId: null, folder: null } : f));
      if (activeFolder === id) setActiveFolder('all');
    }
  };

  const handleMoveFile = async (fileId: string, folderId: string | null) => {
    const res = await fetch(`/api/received-relints/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFiles((prev) => prev.map((f) => f.id === fileId ? updated : f));
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Excluir este arquivo permanentemente? Esta ação não pode ser desfeita.')) return;
    const res = await fetch(`/api/received-relints/${fileId}`, { method: 'DELETE' });
    if (res.ok) setFiles((prev) => prev.filter((f) => f.id !== fileId));
    else alert('Erro ao excluir arquivo.');
  };

  // Filter by active folder then search
  const folderFiltered = files.filter((f) => {
    if (activeFolder === 'all') return true;
    if (activeFolder === 'unassigned') return !f.folderId;
    return f.folderId === activeFolder;
  });
  const filtered = folderFiltered.filter((f) =>
    !search || f.title.toLowerCase().includes(search.toLowerCase()) || f.source.toLowerCase().includes(search.toLowerCase())
  );

  // Group by source agency
  const grouped: Record<string, any[]> = {};
  for (const file of filtered) {
    const key = file.source?.trim() || 'Sem Agência';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(file);
  }
  const sortedSources = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const unassignedCount = files.filter((f) => !f.folderId).length;
  const inputCls = 'w-full input-base px-3 py-2';

  return (
    <div className="flex gap-5 items-start">
      {/* Folder sidebar — admin only */}
      {isAdmin && (
        <div className="w-52 flex-shrink-0 card p-3 sticky top-4">
          <p className="text-xs font-semibold text-subtle uppercase tracking-wider px-2 mb-2">Filtrar por pasta</p>
          <nav className="space-y-0.5">
            <FolderNavItem
              icon={FolderOpen}
              label="Todos os arquivos"
              count={files.length}
              active={activeFolder === 'all'}
              onClick={() => setActiveFolder('all')}
            />
            <FolderNavItem
              icon={FolderX}
              label="Sem pasta"
              count={unassignedCount}
              active={activeFolder === 'unassigned'}
              onClick={() => setActiveFolder('unassigned')}
            />

            {folders.length > 0 && (
              <div className="pt-2 pb-1 px-2">
                <div className="border-t border-gray-100 dark:border-gray-800 pt-2">
                  <p className="text-xs font-semibold text-subtle uppercase tracking-wider">Pastas</p>
                </div>
              </div>
            )}

            {folders.map((folder) => (
              <div key={folder.id} className="group/folder relative">
                {renamingId === folder.id ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <input
                      autoFocus
                      value={renameName}
                      onChange={(e) => setRenameName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder(folder.id); if (e.key === 'Escape') setRenamingId(null); }}
                      className="flex-1 text-xs bg-white dark:bg-gray-800 border border-sigma-400 rounded px-1.5 py-0.5 outline-none"
                    />
                    <button onClick={() => handleRenameFolder(folder.id)} className="text-green-500 hover:text-green-600">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveFolder(folder.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      activeFolder === folder.id
                        ? 'bg-sigma-50 dark:bg-sigma-900/30 text-sigma-700 dark:text-sigma-300 font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 text-left truncate">{folder.name}</span>
                    <span className="text-xs text-subtle">{files.filter((f) => f.folderId === folder.id).length}</span>
                  </button>
                )}
                {renamingId !== folder.id && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover/folder:flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingId(folder.id); setRenameName(folder.name); }}
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                      className="p-0.5 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* New folder input */}
          {showNewFolder ? (
            <div className="mt-2 flex items-center gap-1 px-2">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
                placeholder="Nome da pasta"
                className="flex-1 text-xs bg-white dark:bg-gray-800 border border-sigma-400 rounded px-1.5 py-1 outline-none"
              />
              <button onClick={handleCreateFolder} className="text-sigma-600 hover:text-sigma-700">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setShowNewFolder(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewFolder(true)}
              className="mt-2 flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-subtle hover:text-body hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Nova pasta
            </button>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título ou agência..."
              className="w-full pl-9 pr-4 py-2.5 input-base" />
          </div>
          {isAdmin && (
            <button onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
              <Upload className="w-4 h-4" /> Importar
            </button>
          )}
        </div>

        {showForm && isAdmin && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-title">Importar RELINT Recebido</h3>
              <button onClick={() => setShowForm(false)} className="text-subtle hover:text-body"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-subtle mb-1.5">Título *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Classificação</label>
                <select value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })} className={inputCls}>
                  {['RESERVADO', 'CONFIDENCIAL', 'SECRETO', 'ULTRA_SECRETO'].map((c) => (
                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Pasta</label>
                <select value={form.folderId} onChange={(e) => setForm({ ...form, folderId: e.target.value })} className={inputCls}>
                  <option value="">Sem pasta</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Grupo</label>
                <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} className={inputCls}>
                  <option value="">Todos os grupos</option>
                  {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-4
              ${isDragActive
                ? 'border-sigma-400 bg-sigma-50 dark:bg-sigma-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-sigma-300 dark:hover:border-sigma-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
              <input {...getInputProps()} />
              {selectedFile
                ? <p className="text-sm text-sigma-600 dark:text-sigma-400 font-medium">{selectedFile.name} ({formatFileSize(selectedFile.size)})</p>
                : <p className="text-sm text-subtle">Arraste o arquivo aqui ou clique para selecionar<br /><span className="text-xs">PDF, DOC, DOCX, JPG, PNG</span></p>}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button onClick={handleUpload} disabled={uploading || !selectedFile || !form.title}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-sigma-600 hover:bg-sigma-700 text-white rounded-xl transition-colors disabled:opacity-50">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importar
              </button>
            </div>
          </motion.div>
        )}

        {filtered.length === 0 ? (
          <div className="card py-12 text-center">
            <File className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-subtle text-sm">Nenhum arquivo encontrado</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedSources.map((source) => (
              <AgencyGroup
                key={source}
                source={source}
                files={grouped[source]}
                folders={folders}
                isAdmin={isAdmin}
                onMove={handleMoveFile}
                onDelete={handleDeleteFile}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FolderNavItem({ icon: Icon, label, count, active, onClick }: {
  icon: any; label: string; count: number; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-sigma-50 dark:bg-sigma-900/30 text-sigma-700 dark:text-sigma-300 font-medium'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      <span className="text-xs text-subtle">{count}</span>
    </button>
  );
}

function AgencyGroup({ source, files, folders, isAdmin, onMove, onDelete }: {
  source: string; files: any[]; folders: RRFolder[]; isAdmin: boolean;
  onMove: (fileId: string, folderId: string | null) => Promise<void>;
  onDelete: (fileId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 mb-3 w-full text-left group">
        <div className="w-7 h-7 bg-sigma-100 dark:bg-sigma-900/30 rounded-lg flex items-center justify-center">
          <Building2 className="w-3.5 h-3.5 text-sigma-600 dark:text-sigma-400" />
        </div>
        <span className="font-semibold text-sm text-title">{source}</span>
        <span className="text-xs text-subtle font-normal">{files.length} arquivo{files.length !== 1 ? 's' : ''}</span>
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800 mx-2" />
        <ChevronDown className={`w-4 h-4 text-subtle transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map((file, i) => (
                <FileCard
                  key={file.id}
                  file={file}
                  index={i}
                  folders={folders}
                  isAdmin={isAdmin}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FileCard({ file, index, folders, isAdmin, onMove, onDelete }: {
  file: any; index: number; folders: RRFolder[]; isAdmin: boolean;
  onMove: (fileId: string, folderId: string | null) => Promise<void>;
  onDelete: (fileId: string) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpenMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuStyle({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMenuOpen((v) => !v);
  };

  const handleMove = async (folderId: string | null) => {
    setMoving(true);
    setMenuOpen(false);
    await onMove(file.id, folderId);
    setMoving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="card p-5 hover:shadow-md transition-shadow relative group/card"
    >
      {/* Admin controls — button stays in card, dropdown rendered via portal */}
      {isAdmin && (
        <>
          <button
            ref={btnRef}
            onClick={handleOpenMenu}
            className="absolute top-3 right-3 opacity-0 group-hover/card:opacity-100 transition-opacity p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            {moving ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
          </button>
          {menuOpen && typeof document !== 'undefined' && createPortal(
            <div
              ref={dropdownRef}
              style={{ position: 'fixed', top: menuStyle.top, right: menuStyle.right, zIndex: 9999 }}
              className="w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xs font-semibold text-subtle uppercase tracking-wider">Mover para pasta</p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <button
                  onClick={() => handleMove(null)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${!file.folderId ? 'text-sigma-600 dark:text-sigma-400 font-medium' : 'text-body'}`}
                >
                  <FolderX className="w-3.5 h-3.5 flex-shrink-0 text-subtle" />
                  Sem pasta
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleMove(f.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${file.folderId === f.id ? 'text-sigma-600 dark:text-sigma-400 font-medium' : 'text-body'}`}
                  >
                    <Folder className="w-3.5 h-3.5 flex-shrink-0 text-subtle" />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => { setMenuOpen(false); onDelete(file.id); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
                  Excluir arquivo
                </button>
              </div>
            </div>,
            document.body
          )}
        </>
      )}

      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <File className="w-5 h-5 text-red-500 dark:text-red-400" />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <p className="text-sm font-medium text-title truncate">{file.title}</p>
          <p className="text-xs text-subtle">{file.source}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getClassificationColor(file.classification)}`}>
          {file.classification}
        </span>
        {file.folder && (
          <span className="text-xs text-sigma-600 dark:text-sigma-400 bg-sigma-50 dark:bg-sigma-900/20 px-2 py-0.5 rounded-full border border-sigma-200 dark:border-sigma-800 flex items-center gap-1">
            <Folder className="w-2.5 h-2.5" /> {file.folder.name}
          </span>
        )}
        {file.group && (
          <span className="text-xs text-subtle bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
            {file.group.name}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-subtle mb-3">
        <span>{formatDate(file.createdAt)} · {formatFileSize(file.fileSize)}</span>
        <span>por {file.uploadedBy?.name}</span>
      </div>

      {file.localPath && (
        <div className="flex gap-2">
          <a href={file.localPath} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg py-1.5 text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Eye className="w-3.5 h-3.5" /> Visualizar
          </a>
          <a href={file.localPath} download={file.originalName}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg py-1.5 text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Download className="w-3.5 h-3.5" /> Baixar
          </a>
        </div>
      )}
    </motion.div>
  );
}
