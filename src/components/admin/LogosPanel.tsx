'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle, Loader2, ImageIcon } from 'lucide-react';

interface BadgeSlot {
  key: string;
  label: string;
  description: string;
  position: string;
}

const SLOTS: BadgeSlot[] = [
  {
    key: 'badge-sejus',
    label: 'SEJUS',
    description: 'Escudo azul da Secretaria de Estado da Justiça',
    position: 'Cabeçalho — esquerda',
  },
  {
    key: 'badge-aip',
    label: 'AIP/SEJUS/RO',
    description: 'Brasão central com coruja — Agência de Inteligência Penal',
    position: 'Cabeçalho — centro',
  },
  {
    key: 'badge-policia-penal',
    label: 'Polícia Penal RO',
    description: 'Escudo da Polícia Penal do Estado de Rondônia',
    position: 'Cabeçalho — direita',
  },
];

function BadgeCard({ slot }: { slot: BadgeSlot }) {
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use timestamp to bust cache after upload
  const [ts, setTs] = useState(Date.now());
  const currentUrl = `/logos/${slot.key}.png?t=${ts}`;

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Apenas imagens são permitidas (PNG, JPG, WebP, SVG).');
      return;
    }

    // Local preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    setSuccess(false);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('slot', slot.key);

      const res = await fetch('/api/admin/logos', { method: 'POST', body: form });
      if (res.ok) {
        setTs(Date.now());
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao enviar imagem.');
        setPreview(null);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="card p-5 flex gap-4 items-start">
      {/* Preview do badge */}
      <div
        className="w-20 h-20 flex-shrink-0 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-800 overflow-hidden"
        style={{ minWidth: 80 }}
      >
        <img
          src={preview ?? currentUrl}
          alt={slot.label}
          className="w-16 h-16 object-contain"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.style.display = 'none';
            img.nextElementSibling?.removeAttribute('style');
          }}
        />
        <ImageIcon className="w-8 h-8 text-gray-300 dark:text-gray-600 hidden" style={{ display: 'none' }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-title">{slot.label}</p>
        <p className="text-xs text-subtle mt-0.5">{slot.description}</p>
        <p className="text-xs text-subtle mt-0.5">
          Posição: <span className="font-medium text-body">{slot.position}</span>
        </p>
        <p className="text-xs text-subtle mt-0.5">
          Arquivo: <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">{slot.key}.png</code>
        </p>

        <div className="mt-3 flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 text-body"
          >
            {uploading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Enviando...' : 'Trocar imagem'}
          </button>

          {success && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
              <CheckCircle className="w-3.5 h-3.5" /> Salvo!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function LogosPanel() {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-sm text-body">
          Gerencie os brasões exibidos no cabeçalho dos documentos RELINT. Formatos aceitos: <strong>PNG, JPG, WebP, SVG</strong>.
          Recomendado: fundo transparente (PNG) para melhor resultado na impressão.
        </p>
      </div>
      {SLOTS.map((slot) => (
        <BadgeCard key={slot.key} slot={slot} />
      ))}
    </div>
  );
}
