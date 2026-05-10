'use client';

import { useRef, useState, useCallback } from 'react';
import { Type, ImagePlus, X, Loader2, ChevronUp, ChevronDown, AlignLeft, AlignCenter, AlignRight, GripVertical } from 'lucide-react';

export type TextBlock = { type: 'text'; id: string; content: string };
export type ImageBlock = {
  type: 'image';
  id: string;
  url: string;
  caption: string;
  align?: 'left' | 'center' | 'right';
  width?: number; // 10–100
};
export type Block = TextBlock | ImageBlock;

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
      next.splice(idx, 0, { type: 'image', id: newId(), url: data.url, caption: '', align: 'center', width: 100 });
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

  const updateBlock = useCallback((id: string, patch: Record<string, any>) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } as Block : b)));
  }, [blocks, onChange]);

  const removeBlock = (id: string) => onChange(blocks.filter((b) => b.id !== id));

  const moveBlock = (idx: number, dir: 'up' | 'down') => {
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    onChange(next);
  };

  // Drag-to-resize: tracks mousedown on the resize handle at image corner
  const startResize = useCallback((e: React.MouseEvent, blockId: string, currentWidth: number, wrapperRef: React.RefObject<HTMLDivElement>) => {
    e.preventDefault();
    const parentWidth = wrapperRef.current?.parentElement?.getBoundingClientRect().width ?? 400;
    const startX = e.clientX;

    const onMove = (me: MouseEvent) => {
      const delta = me.clientX - startX;
      const newPct = Math.max(10, Math.min(100, Math.round(currentWidth + (delta / parentWidth) * 100)));
      updateBlock(blockId, { width: newPct });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [updateBlock]);

  return (
    <div className="space-y-1">
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
            <TextBlockView
              block={block as TextBlock}
              idx={i}
              total={blocks.length}
              onUpdate={updateBlock}
              onRemove={removeBlock}
              onMove={moveBlock}
            />
          ) : (
            <ImageBlockView
              block={block as ImageBlock}
              idx={i}
              total={blocks.length}
              onUpdate={updateBlock}
              onRemove={removeBlock}
              onMove={moveBlock}
              onStartResize={startResize}
            />
          )}

          <InsertBar idx={i + 1} onText={insertTextAt} onImage={triggerImagePicker}
            active={dragOverIdx === i + 1}
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

/* ── Text block ── */
function TextBlockView({ block, idx, total, onUpdate, onRemove, onMove }: {
  block: TextBlock; idx: number; total: number;
  onUpdate: (id: string, patch: any) => void;
  onRemove: (id: string) => void;
  onMove: (idx: number, dir: 'up' | 'down') => void;
}) {
  return (
    <div className="relative group/block">
      <textarea
        value={block.content}
        onChange={(e) => onUpdate(block.id, { content: e.target.value })}
        placeholder="Digite o texto aqui..."
        rows={5}
        spellCheck
        lang="pt-BR"
        className="w-full input-base px-4 py-3 resize-none leading-relaxed pr-16"
      />
      <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover/block:opacity-100 transition-opacity">
        {idx > 0 && (
          <button type="button" onClick={() => onMove(idx, 'up')} title="Mover para cima"
            className="w-6 h-6 bg-gray-600 text-white rounded flex items-center justify-center hover:bg-sigma-600 transition-colors">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        )}
        {idx < total - 1 && (
          <button type="button" onClick={() => onMove(idx, 'down')} title="Mover para baixo"
            className="w-6 h-6 bg-gray-600 text-white rounded flex items-center justify-center hover:bg-sigma-600 transition-colors">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
        {total > 1 && (
          <button type="button" onClick={() => onRemove(block.id)} title="Remover bloco"
            className="w-6 h-6 bg-red-500 text-white rounded flex items-center justify-center hover:bg-red-600 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Image block ── */
function ImageBlockView({ block, idx, total, onUpdate, onRemove, onMove, onStartResize }: {
  block: ImageBlock; idx: number; total: number;
  onUpdate: (id: string, patch: any) => void;
  onRemove: (id: string) => void;
  onMove: (idx: number, dir: 'up' | 'down') => void;
  onStartResize: (e: React.MouseEvent, id: string, w: number, ref: React.RefObject<HTMLDivElement>) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const align = block.align ?? 'center';
  const width = block.width ?? 100;

  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };

  const alignBtn = (val: 'left' | 'center' | 'right', Icon: React.ComponentType<any>, label: string) => (
    <button type="button" title={label} onClick={() => onUpdate(block.id, { align: val })}
      className={`p-1.5 rounded transition-colors ${align === val
        ? 'bg-sigma-100 dark:bg-sigma-900/40 text-sigma-600 dark:text-sigma-400'
        : 'text-subtle hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
      {/* Toolbar — always visible */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {/* Alignment */}
        <div className="flex items-center gap-0.5">
          {alignBtn('left', AlignLeft, 'Alinhar à esquerda')}
          {alignBtn('center', AlignCenter, 'Centralizar')}
          {alignBtn('right', AlignRight, 'Alinhar à direita')}
        </div>

        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

        {/* Move */}
        {idx > 0 && (
          <button type="button" onClick={() => onMove(idx, 'up')} title="Mover para cima"
            className="p-1.5 rounded text-subtle hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
        {idx < total - 1 && (
          <button type="button" onClick={() => onMove(idx, 'down')} title="Mover para baixo"
            className="p-1.5 rounded text-subtle hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        <div className="flex-1" />

        {/* Width badge */}
        <span className="text-xs font-mono text-subtle bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
          {width}%
        </span>

        {/* Delete */}
        <button type="button" onClick={() => onRemove(block.id)} title="Remover imagem"
          className="p-1.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Image area */}
      <div ref={wrapperRef} className="p-3 select-none" style={{ display: 'flex', justifyContent: justifyMap[align] }}>
        <div className="relative" style={{ width: `${width}%`, minWidth: 48 }}>
          <img
            src={block.url}
            alt={block.caption || 'Imagem'}
            draggable={false}
            style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', maxHeight: '320px' }}
            className="rounded"
          />
          {/* Resize handle — bottom-right corner */}
          <div
            onMouseDown={(e) => onStartResize(e, block.id, width, wrapperRef)}
            title="Arrastar para redimensionar"
            className="absolute bottom-0 right-0 w-5 h-5 flex items-center justify-center cursor-nwse-resize rounded-tl bg-sigma-500 hover:bg-sigma-600 transition-colors z-10"
            style={{ userSelect: 'none' }}
          >
            <GripVertical className="w-3 h-3 text-white rotate-45" />
          </div>
        </div>
      </div>

      {/* Width slider */}
      <div className="px-4 pb-2 pt-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-subtle w-6">10%</span>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={width}
            onChange={(e) => onUpdate(block.id, { width: +e.target.value })}
            className="flex-1 accent-sigma-500 cursor-pointer"
          />
          <span className="text-xs text-subtle w-8 text-right">100%</span>
        </div>
      </div>

      {/* Caption */}
      <div className="px-3 pb-3">
        <input
          value={block.caption}
          onChange={(e) => onUpdate(block.id, { caption: e.target.value })}
          placeholder="Legenda da imagem (opcional)..."
          className="w-full input-base px-3 py-1.5 text-xs"
        />
      </div>
    </div>
  );
}

/* ── Insert bar between blocks ── */
function InsertBar({ idx, onText, onImage, active, onDragEnter, onDragLeave, onDrop }: {
  idx: number;
  onText: (idx: number) => void;
  onImage: (idx: number) => void;
  active: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, idx: number) => void;
}) {
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

export function initBlocks(bodyData: any): Block[] {
  if (!bodyData) return [{ type: 'text', id: crypto.randomUUID(), content: '' }];
  if (typeof bodyData === 'string') return [{ type: 'text', id: crypto.randomUUID(), content: bodyData }];
  if (Array.isArray(bodyData) && bodyData.length > 0) return bodyData as Block[];
  return [{ type: 'text', id: crypto.randomUUID(), content: '' }];
}
