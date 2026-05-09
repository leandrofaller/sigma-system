'use client';

import { useRef, useState } from 'react';
import { Type, ImagePlus, X, Loader2 } from 'lucide-react';

export type TextBlock = { type: 'text'; id: string; content: string };
export type ImageBlock = { type: 'image'; id: string; url: string; caption: string };
export type Block = TextBlock | ImageBlock;

interface InsertBarProps {
  idx: number;
  onText: (idx: number) => void;
  onImage: (idx: number) => void;
  active: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, idx: number) => void;
}

function InsertBar({ idx, onText, onImage, active, onDragEnter, onDragLeave, onDrop }: InsertBarProps) {
  return (
    <div
      className={`flex items-center gap-1.5 my-1 transition-opacity ${active ? 'opacity-100' : 'opacity-30 hover:opacity-100'}`}
      onDragOver={(e) => { e.preventDefault(); onDragEnter(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, idx)}
    >
      <div className={`flex-1 h-px ${active ? 'bg-sigma-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
      <button type="button" onClick={() => onText(idx)}
        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-subtle hover:text-sigma-600 hover:border-sigma-400 transition-colors">
        <Type className="w-3 h-3" /> Texto
      </button>
      <button type="button" onClick={() => onImage(idx)}
        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-subtle hover:text-sigma-600 hover:border-sigma-400 transition-colors">
        <ImagePlus className="w-3 h-3" /> Foto
      </button>
      <div className={`flex-1 h-px ${active ? 'bg-sigma-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
    </div>
  );
}

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

export function BlockEditor({ blocks, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const insertIdxRef = useRef(0);

  const newId = () => crypto.randomUUID();

  const insertTextAt = (idx: number) => {
    const next = [...blocks];
    next.splice(idx, 0, { type: 'text', id: newId(), content: '' });
    onChange(next);
  };

  const insertImageAt = async (file: File, idx: number) => {
    if (!file.type.startsWith('image/')) { alert('Apenas imagens são permitidas.'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/relints/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Erro ao enviar imagem.'); return; }
      const next = [...blocks];
      next.splice(idx, 0, { type: 'image', id: newId(), url: data.url, caption: '' });
      onChange(next);
    } finally {
      setUploading(false);
    }
  };

  const triggerImagePicker = (idx: number) => {
    insertIdxRef.current = idx;
    fileInputRef.current?.click();
  };

  const handleFileDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(null);
    const file = e.dataTransfer.files?.[0];
    if (file) insertImageAt(file, idx);
  };

  const updateBlock = (id: string, patch: Partial<Block>) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } as Block : b)));
  };

  const removeBlock = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
  };

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) insertImageAt(f, insertIdxRef.current);
          e.target.value = '';
        }} />

      <InsertBar idx={0} onText={insertTextAt} onImage={triggerImagePicker}
        active={dragOverIdx === 0}
        onDragEnter={() => setDragOverIdx(0)}
        onDragLeave={() => setDragOverIdx(null)}
        onDrop={handleFileDrop} />

      {blocks.map((block, i) => (
        <div key={block.id}>
          {block.type === 'text' ? (
            <div className="relative group/block">
              <textarea
                value={(block as TextBlock).content}
                onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                placeholder="Digite o texto aqui..."
                rows={5}
                spellCheck
                lang="pt-BR"
                className="w-full input-base px-4 py-3 resize-none leading-relaxed"
              />
              {blocks.length > 1 && (
                <button type="button" onClick={() => removeBlock(block.id)}
                  className="absolute top-2 right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors opacity-0 group-hover/block:opacity-100">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            <div className="relative border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <img src={(block as ImageBlock).url} alt={(block as ImageBlock).caption || 'Imagem'}
                className="w-full max-h-64 object-contain bg-gray-50 dark:bg-gray-900" />
              <button type="button" onClick={() => removeBlock(block.id)}
                className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
              <div className="p-2">
                <input value={(block as ImageBlock).caption}
                  onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                  placeholder="Legenda da imagem (opcional)..."
                  className="w-full input-base px-2 py-1 text-xs" />
              </div>
            </div>
          )}

          <InsertBar idx={i + 1} onText={insertTextAt} onImage={triggerImagePicker}
            active={dragOverIdx === i + 1 || (uploading && insertIdxRef.current === i + 1)}
            onDragEnter={() => setDragOverIdx(i + 1)}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={handleFileDrop} />
        </div>
      ))}

      {uploading && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-subtle">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando imagem...
        </div>
      )}
    </div>
  );
}

export function initBlocks(bodyData: any): Block[] {
  if (!bodyData) return [{ type: 'text', id: crypto.randomUUID(), content: '' }];
  if (typeof bodyData === 'string') {
    return [{ type: 'text', id: crypto.randomUUID(), content: bodyData }];
  }
  if (Array.isArray(bodyData) && bodyData.length > 0) return bodyData as Block[];
  return [{ type: 'text', id: crypto.randomUUID(), content: '' }];
}
