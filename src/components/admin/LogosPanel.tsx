'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, Loader2, ImageIcon, Save } from 'lucide-react';

interface BadgeSizes {
  sejus: number;
  aip: number;
  policiaPenal: number;
}

const DEFAULT_SIZES: BadgeSizes = { sejus: 72, aip: 80, policiaPenal: 72 };

const SLOTS = [
  { key: 'badge-sejus',         sizeKey: 'sejus' as keyof BadgeSizes,        label: 'SEJUS',           position: 'Esquerda' },
  { key: 'badge-aip',           sizeKey: 'aip' as keyof BadgeSizes,          label: 'AIP/SEJUS/RO',    position: 'Centro'   },
  { key: 'badge-policia-penal', sizeKey: 'policiaPenal' as keyof BadgeSizes, label: 'Polícia Penal RO', position: 'Direita'  },
];

function BadgeUpload({ slot, onUploaded }: { slot: typeof SLOTS[0]; onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { alert('Apenas imagens permitidas.'); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('slot', slot.key);
      const res = await fetch('/api/admin/logos', { method: 'POST', body: form });
      if (res.ok) { setSuccess(true); setTimeout(() => setSuccess(false), 3000); onUploaded(); }
      else { const d = await res.json(); alert(d.error || 'Erro ao enviar.'); }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <button onClick={() => inputRef.current?.click()} disabled={uploading}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 text-body">
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {uploading ? 'Enviando...' : 'Trocar imagem'}
      </button>
      {success && (
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
          <CheckCircle className="w-3.5 h-3.5" /> Salvo!
        </span>
      )}
    </div>
  );
}

export function LogosPanel() {
  const [sizes, setSizes] = useState<BadgeSizes>(DEFAULT_SIZES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ts, setTs] = useState(Date.now());

  useEffect(() => {
    fetch('/api/relint-config')
      .then((r) => r.json())
      .then((d) => setSizes({ ...DEFAULT_SIZES, ...d }))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badge_sizes: sizes }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const imgUrl = (key: string) => `/logos/${key}.png?t=${ts}`;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <p className="text-sm text-body">
          Gerencie os brasões exibidos no cabeçalho do RELINT. Use os controles deslizantes para ajustar o tamanho
          e visualize o resultado em tempo real no preview abaixo.
        </p>
      </div>

      {/* ── Controles por badge ── */}
      {SLOTS.map((slot) => (
        <div key={slot.key} className="card p-5">
          <div className="flex items-center gap-4 mb-4">
            {/* Miniatura atual */}
            <div className="w-16 h-16 flex-shrink-0 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-800 overflow-hidden">
              <img src={imgUrl(slot.key)} alt={slot.label}
                className="object-contain" style={{ width: sizes[slot.sizeKey] * 0.6, height: 'auto' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-title">{slot.label}</p>
              <p className="text-xs text-subtle">Posição: {slot.position} · Arquivo: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">{slot.key}.png</code></p>
              <div className="mt-2">
                <BadgeUpload slot={slot} onUploaded={() => setTs(Date.now())} />
              </div>
            </div>
          </div>

          {/* Slider de tamanho */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-subtle w-14">Tamanho</span>
            <input
              type="range" min={40} max={140} step={4}
              value={sizes[slot.sizeKey]}
              onChange={(e) => setSizes((prev) => ({ ...prev, [slot.sizeKey]: Number(e.target.value) }))}
              className="flex-1 accent-sigma-500 cursor-pointer"
            />
            <span className="text-xs font-mono text-body w-12 text-right">{sizes[slot.sizeKey]}px</span>
          </div>
        </div>
      ))}

      {/* ── Preview ao vivo do cabeçalho ── */}
      <div className="card p-5">
        <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-4">Preview do Cabeçalho</p>
        <div className="bg-white rounded-xl border border-gray-200 p-4"
          style={{ fontFamily: 'Arial, sans-serif' }}>
          {/* Carimbo */}
          <div className="text-center mb-2">
            <span style={{ color: '#b91c1c', border: '2px solid #b91c1c', fontWeight: 'bold',
              fontSize: '11px', letterSpacing: '0.12em', padding: '1px 12px', display: 'inline-block' }}>
              RESERVADO
            </span>
          </div>

          {/* 3 colunas */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ width: sizes.sejus + 8, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
              <img src={imgUrl('badge-sejus')} alt="SEJUS"
                style={{ width: sizes.sejus, height: 'auto' }}
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = 'none';
                  (el.nextSibling as HTMLElement)?.removeAttribute('style');
                }} />
              <div style={{ width: sizes.sejus, height: sizes.sejus, background: '#e5e7eb',
                display: 'none', borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>SEJUS</div>
            </div>

            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontWeight: 'bold', fontSize: '8px', margin: '0 0 1px', textTransform: 'uppercase', color: '#111' }}>
                SECRETARIA DE ESTADO DA JUSTIÇA DE RONDÔNIA
              </p>
              <p style={{ fontWeight: 'bold', fontSize: '8px', margin: '0 0 1px', textTransform: 'uppercase', color: '#111' }}>
                AGÊNCIA DE INTELIGÊNCIA PENAL
              </p>
              <p style={{ fontWeight: 'bold', fontSize: '10px', margin: '1px 0 4px', textTransform: 'uppercase', color: '#111' }}>
                AIP/SEJUS/RO
              </p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <img src={imgUrl('badge-aip')} alt="AIP"
                  style={{ width: sizes.aip, height: 'auto' }}
                  onError={(e) => {
                    const el = e.target as HTMLImageElement;
                    el.style.display = 'none';
                    (el.nextSibling as HTMLElement)?.removeAttribute('style');
                  }} />
                <div style={{ width: sizes.aip, height: sizes.aip, background: '#e5e7eb',
                  display: 'none', borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>AIP</div>
              </div>
            </div>

            <div style={{ width: sizes.policiaPenal + 8, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
              <img src={imgUrl('badge-policia-penal')} alt="PP"
                style={{ width: sizes.policiaPenal, height: 'auto' }}
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = 'none';
                  (el.nextSibling as HTMLElement)?.removeAttribute('style');
                }} />
              <div style={{ width: sizes.policiaPenal, height: sizes.policiaPenal, background: '#e5e7eb',
                display: 'none', borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>PP</div>
            </div>
          </div>

          <hr style={{ borderTop: '1.5px solid #000', margin: '8px 0 4px' }} />
          <p style={{ fontSize: '7px', color: '#555', margin: 0 }}>
            <strong><u>RELINT Nº 000/2026/AIP/SEJUS/RO</u></strong> &nbsp;·&nbsp; Data: __/__/____
          </p>
        </div>
      </div>

      {/* ── Salvar tamanhos ── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-sigma-600 hover:bg-sigma-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Salvando...' : 'Salvar tamanhos'}
          {saved && !saving && <CheckCircle className="w-4 h-4 text-green-300" />}
        </button>
      </div>
    </div>
  );
}
