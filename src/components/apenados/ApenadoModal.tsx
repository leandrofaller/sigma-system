'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Camera, Loader2, CheckCircle, User, Trash2, RotateCcw, RotateCw } from 'lucide-react';
import type { Apenado } from './ApenadoCard';

interface Props {
  apenado: Apenado | null;
  onClose: () => void;
  onSaved: (a: Apenado) => void;
  userRole: string;
}

export function ApenadoModal({ apenado, onClose, onSaved, userRole }: Props) {
  const isEdit = !!apenado?.id;
  const canDeletePhoto = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

  const [form, setForm] = useState({
    name: apenado?.name || '',
    matricula: apenado?.matricula || '',
    unidade: apenado?.unidade || '',
    faccao: apenado?.faccao || '',
    notes: apenado?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    apenado?.photoPath ? `/api/apenados/${apenado.id}/foto` : null
  );
  const [uploading, setUploading] = useState(false);
  const [uploadedForId, setUploadedForId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const inputCls = 'w-full input-base px-3 py-2 text-sm';

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { alert('Apenas imagens.'); return; }
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
    setPendingFile(file);
  }, []);

  const uploadPhoto = useCallback(async (id: string, file: File): Promise<void> => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('foto', file);
      const res = await fetch(`/api/apenados/${id}/foto`, { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status} ao salvar foto`);
      }
      setUploadedForId(id);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? `/api/apenados/${apenado!.id}` : '/api/apenados';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      const saved: Apenado = await res.json();

      if (pendingFile) {
        try {
          await uploadPhoto(saved.id, pendingFile);
          saved.photoPath = `uploads/apenados/${saved.id}.jpg`;
        } catch (uploadErr: any) {
          alert(`Apenado salvo, mas houve um erro ao salvar a foto: ${uploadErr.message}`);
        }
      }

      onSaved(saved);
    } catch {
      alert('Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleRotate = async (degrees: 90 | 270) => {
    if (!isEdit || !apenado?.id) return;
    setRotating(true);
    try {
      const res = await fetch(`/api/apenados/${apenado.id}/foto/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ degrees }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Erro ao rotar foto'); return; }
      setPhotoVersion((v) => v + 1);
      setPhotoPreview(`/api/apenados/${apenado.id}/foto?v=${photoVersion + 1}`);
    } finally {
      setRotating(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!isEdit || !apenado?.id) return;
    if (!confirm('Remover permanentemente a foto deste registro?')) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/apenados/${apenado.id}/foto`, { method: 'DELETE' });
      if (!res.ok) { alert('Erro ao remover foto.'); return; }
      // Notify parent with updated record (photoPath null) and close modal
      onSaved({ ...apenado, ...form, name: form.name.trim().toUpperCase(), photoPath: null });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="gradient-sigma px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">{isEdit ? 'Editar Apenado' : 'Novo Apenado'}</p>
              <p className="text-white/70 text-xs">Identificação do sistema penal</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Photo upload */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-subtle uppercase tracking-wider">Foto</label>
              {isEdit && apenado?.photoPath && canDeletePhoto && (
                <button
                  onClick={handleDeletePhoto}
                  disabled={uploading}
                  className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" /> Remover foto
                </button>
              )}
            </div>
            <div
              className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
                ${dragging
                  ? 'border-sigma-400 bg-sigma-50 dark:bg-sigma-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-sigma-300 dark:hover:border-sigma-700'
                }`}
              style={{ height: 200 }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              {photoPreview ? (
                <>
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      setPhotoPreview(null);
                    }}
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="flex items-center gap-2 text-white text-sm font-semibold">
                      <Camera className="w-5 h-5" /> Trocar foto
                    </div>
                  </div>
                  {isEdit && apenado?.photoPath && !pendingFile && (
                    <div className="absolute bottom-2 right-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleRotate(270)}
                        disabled={rotating || uploading}
                        title="Rotar 90° esquerda"
                        className="w-7 h-7 flex items-center justify-center bg-black/60 hover:bg-black/80 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {rotating ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 text-white" />}
                      </button>
                      <button
                        onClick={() => handleRotate(90)}
                        disabled={rotating || uploading}
                        title="Rotar 90° direita"
                        className="w-7 h-7 flex items-center justify-center bg-black/60 hover:bg-black/80 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <RotateCw className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                  )}
                  {uploadedForId && !uploading && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="w-6 h-6 text-green-400" />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 dark:text-gray-600">
                  <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-body">Arraste ou clique para adicionar foto</p>
                    <p className="text-xs text-subtle mt-0.5">JPG, PNG, WebP — máx. 50MB</p>
                  </div>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }}
            />
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Nome Completo *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value.toUpperCase() }))}
                placeholder="NOME COMPLETO DO APENADO"
                className={inputCls}
                autoFocus={!isEdit}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Matrícula</label>
                <input
                  value={form.matricula}
                  onChange={(e) => setForm((p) => ({ ...p, matricula: e.target.value }))}
                  placeholder="Ex: 2024-0001"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Unidade</label>
                <input
                  value={form.unidade}
                  onChange={(e) => setForm((p) => ({ ...p, unidade: e.target.value }))}
                  placeholder="Ex: CPP-I"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Facção</label>
              <input
                value={form.faccao}
                onChange={(e) => setForm((p) => ({ ...p, faccao: e.target.value.toUpperCase() }))}
                placeholder="Ex: CV, PCC..."
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Observações</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                placeholder="Informações adicionais relevantes..."
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-body border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-sigma-600 hover:bg-sigma-700 rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-sigma-600/20">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Salvando...' : (isEdit ? 'Salvar Alterações' : 'Cadastrar')}
          </button>
        </div>
      </div>
    </div>
  );
}
