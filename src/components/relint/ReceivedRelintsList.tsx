'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { Upload, File, Search, Loader2, X } from 'lucide-react';
import { formatDate, formatFileSize, getClassificationColor } from '@/lib/utils';

interface Props {
  files: any[];
  groups: any[];
  userId: string;
  role: string;
}

export function ReceivedRelintsList({ files: initialFiles, groups, userId, role }: Props) {
  const [files, setFiles] = useState(initialFiles);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', source: '', groupId: '', notes: '', classification: 'RESERVADO' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => { if (accepted[0]) setSelectedFile(accepted[0]); },
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.png'], 'application/msword': ['.doc', '.docx'] },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!selectedFile || !form.title || !form.source) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));

      const res = await fetch('/api/received-relints', { method: 'POST', body: fd });
      const data = await res.json();
      setFiles((prev) => [data, ...prev]);
      setShowForm(false);
      setSelectedFile(null);
      setForm({ title: '', source: '', groupId: '', notes: '', classification: 'RESERVADO' });
    } catch {
      alert('Erro ao enviar arquivo.');
    } finally {
      setUploading(false);
    }
  };

  const filtered = files.filter((f) =>
    !search || f.title.toLowerCase().includes(search.toLowerCase()) || f.source.toLowerCase().includes(search.toLowerCase())
  );

  const inputCls = 'w-full input-base px-3 py-2';

  return (
    <div className="space-y-4">
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
            <Upload className="w-4 h-4" /> Importar Arquivo
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
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Título *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Agência de Origem *</label>
              <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="Ex: SESP/RO, DEPEN, etc." className={inputCls} />
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
              <label className="block text-xs font-medium text-subtle mb-1.5">Grupo</label>
              <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} className={inputCls}>
                <option value="">Todos os grupos</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
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
            <button onClick={handleUpload} disabled={uploading || !selectedFile || !form.title || !form.source}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-sigma-600 hover:bg-sigma-700 text-white rounded-xl transition-colors disabled:opacity-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar
            </button>
          </div>
        </motion.div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-3 card py-12 text-center">
            <File className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-subtle text-sm">Nenhum arquivo importado</p>
          </div>
        )}
        {filtered.map((file, i) => (
          <motion.div key={file.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <File className="w-5 h-5 text-red-500 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-title truncate">{file.title}</p>
                <p className="text-xs text-subtle">{file.source}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getClassificationColor(file.classification)}`}>
                {file.classification}
              </span>
              {file.group && (
                <span className="text-xs text-subtle bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                  {file.group.name}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-subtle">
              <span>{formatDate(file.createdAt)} · {formatFileSize(file.fileSize)}</span>
              <span>por {file.uploadedBy?.name}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
