'use client';

import { useRef, useState, useCallback } from 'react';
import {
  Type, ImagePlus, X, Loader2, ChevronUp, ChevronDown,
  AlignLeft, AlignCenter, AlignRight, GripVertical, Columns2,
} from 'lucide-react';
import { RichTextEditor } from './RichTextEditor';

export type TextBlock  = { type: 'text';  id: string; content: string };
export type ImageBlock = {
  type: 'image'; id: string;
  url: string; caption: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
};
export type RowBlock = {
  type: 'row'; id: string;
  url: string; caption: string;
  imagePosition: 'left' | 'right';
  imageWidth: number;   // 20–70
  text: string;
};
export type Block = TextBlock | ImageBlock | RowBlock;

// ── helpers ──────────────────────────────────────────────────────
function newId() { return crypto.randomUUID(); }

async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Apenas imagens.');
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/relints/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao enviar imagem.');
  return data.url as string;
}

// ── resize hook ───────────────────────────────────────────────────
function useResize(
  getCurrentWidth: () => number,
  setWidth: (w: number) => void,
  wrapperRef: React.RefObject<HTMLDivElement>,
) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    const parentW = wrapperRef.current?.parentElement?.getBoundingClientRect().width ?? 400;
    const startX  = e.clientX;
    const startW  = getCurrentWidth();

    const onMove = (me: MouseEvent) => {
      const delta = me.clientX - startX;
      setWidth(Math.max(10, Math.min(100, Math.round(startW + (delta / parentW) * 100))));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
}

// ── main editor ───────────────────────────────────────────────────
interface Props { blocks: Block[]; onChange: (blocks: Block[]) => void; }

export function BlockEditor({ blocks, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const insertIdxRef   = useRef(0);
  const insertModeRef  = useRef<'image' | 'row'>('image');

  const patch = useCallback((id: string, p: Record<string, any>) =>
    onChange(blocks.map(b => b.id === id ? { ...b, ...p } as Block : b)), [blocks, onChange]);

  const remove = (id: string) => onChange(blocks.filter(b => b.id !== id));

  const move = (idx: number, dir: 'up' | 'down') => {
    const sw = dir === 'up' ? idx - 1 : idx + 1;
    if (sw < 0 || sw >= blocks.length) return;
    const n = [...blocks]; [n[idx], n[sw]] = [n[sw], n[idx]]; onChange(n);
  };

  const insertTextAt = (idx: number) => {
    const n = [...blocks];
    n.splice(idx, 0, { type: 'text', id: newId(), content: '' });
    onChange(n);
  };

  const triggerFile = (idx: number, mode: 'image' | 'row') => {
    insertIdxRef.current = idx;
    insertModeRef.current = mode;
    fileInputRef.current?.click();
  };

  const handleFilePicked = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      const idx = insertIdxRef.current;
      const n   = [...blocks];
      if (insertModeRef.current === 'row') {
        n.splice(idx, 0, { type: 'row', id: newId(), url, caption: '', imagePosition: 'left', imageWidth: 35, text: '' });
      } else {
        n.splice(idx, 0, { type: 'image', id: newId(), url, caption: '', align: 'center', width: 100 });
      }
      onChange(n);
    } catch (err: any) { alert(err.message); }
    finally { setUploading(false); }
  };

  const handleFileDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault(); setDragOverIdx(null);
    const file = e.dataTransfer.files?.[0];
    if (file) { insertIdxRef.current = idx; insertModeRef.current = 'image'; handleFilePicked(file); }
  };

  return (
    <div className="space-y-1">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); e.target.value = ''; }} />

      <InsertBar idx={0} onText={insertTextAt} onImage={i => triggerFile(i, 'image')} onRow={i => triggerFile(i, 'row')}
        active={dragOverIdx === 0}
        onDragEnter={() => setDragOverIdx(0)} onDragLeave={() => setDragOverIdx(null)} onDrop={handleFileDrop} />

      {blocks.map((block, i) => (
        <div key={block.id}>
          {block.type === 'text' ? (
            <TextBlockView block={block as TextBlock} idx={i} total={blocks.length} onPatch={patch} onRemove={remove} onMove={move} />
          ) : block.type === 'image' ? (
            <ImageBlockView block={block as ImageBlock} idx={i} total={blocks.length} onPatch={patch} onRemove={remove} onMove={move} />
          ) : (
            <RowBlockView block={block as RowBlock} idx={i} total={blocks.length} onPatch={patch} onRemove={remove} onMove={move} />
          )}
          <InsertBar idx={i + 1} onText={insertTextAt} onImage={j => triggerFile(j, 'image')} onRow={j => triggerFile(j, 'row')}
            active={dragOverIdx === i + 1}
            onDragEnter={() => setDragOverIdx(i + 1)} onDragLeave={() => setDragOverIdx(null)} onDrop={handleFileDrop} />
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

// ── Insert bar ────────────────────────────────────────────────────
function InsertBar({ idx, onText, onImage, onRow, active, onDragEnter, onDragLeave, onDrop }: {
  idx: number; active: boolean;
  onText: (i: number) => void; onImage: (i: number) => void; onRow: (i: number) => void;
  onDragEnter: () => void; onDragLeave: () => void; onDrop: (e: React.DragEvent, i: number) => void;
}) {
  const line = `flex-1 h-px ${active ? 'bg-sigma-400' : 'bg-gray-300 dark:bg-gray-600'}`;
  const btn  = 'flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-subtle hover:text-sigma-600 hover:border-sigma-400 transition-colors';
  return (
    <div className={`flex items-center gap-1.5 my-1 transition-opacity ${active ? 'opacity-100' : 'opacity-30 hover:opacity-100'}`}
      onDragOver={e => { e.preventDefault(); onDragEnter(); }} onDragLeave={onDragLeave} onDrop={e => onDrop(e, idx)}>
      <div className={line} />
      <button type="button" onClick={() => onText(idx)} className={btn}><Type className="w-3 h-3" /> Texto</button>
      <button type="button" onClick={() => onImage(idx)} className={btn}><ImagePlus className="w-3 h-3" /> Foto</button>
      <button type="button" onClick={() => onRow(idx)} className={btn}><Columns2 className="w-3 h-3" /> Lado a Lado</button>
      <div className={line} />
    </div>
  );
}

// ── Text block ────────────────────────────────────────────────────
function TextBlockView({ block, idx, total, onPatch, onRemove, onMove }: {
  block: TextBlock; idx: number; total: number;
  onPatch: (id: string, p: any) => void; onRemove: (id: string) => void; onMove: (i: number, d: 'up'|'down') => void;
}) {
  return (
    <div className="relative group/block">
      {/* Block-level controls */}
      <div className="flex items-center justify-end gap-1 mb-1 h-6 opacity-0 group-hover/block:opacity-100 transition-opacity">
        {idx > 0 && <MoveBtn dir="up" onClick={() => onMove(idx, 'up')} />}
        {idx < total - 1 && <MoveBtn dir="down" onClick={() => onMove(idx, 'down')} />}
        {total > 1 && <DelBtn onClick={() => onRemove(block.id)} />}
      </div>
      <RichTextEditor
        content={block.content}
        onChange={html => onPatch(block.id, { content: html })}
      />
    </div>
  );
}

// ── Image block ───────────────────────────────────────────────────
function ImageBlockView({ block, idx, total, onPatch, onRemove, onMove }: {
  block: ImageBlock; idx: number; total: number;
  onPatch: (id: string, p: any) => void; onRemove: (id: string) => void; onMove: (i: number, d: 'up'|'down') => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const align = block.align ?? 'center';
  const width = block.width ?? 100;
  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

  const startResize = useResize(
    () => block.width ?? 100,
    w => onPatch(block.id, { width: w }),
    wrapperRef,
  );

  const AlignBtn = ({ val, Icon }: { val: 'left'|'center'|'right'; Icon: React.ComponentType<any> }) => (
    <button type="button" onClick={() => onPatch(block.id, { align: val })}
      className={`p-1.5 rounded transition-colors ${align === val ? 'bg-sigma-100 dark:bg-sigma-900/40 text-sigma-600' : 'text-subtle hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <AlignBtn val="left" Icon={AlignLeft} /><AlignBtn val="center" Icon={AlignCenter} /><AlignBtn val="right" Icon={AlignRight} />
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
        {idx > 0 && <button type="button" onClick={() => onMove(idx, 'up')} className="p-1.5 rounded text-subtle hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronUp className="w-4 h-4" /></button>}
        {idx < total - 1 && <button type="button" onClick={() => onMove(idx, 'down')} className="p-1.5 rounded text-subtle hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronDown className="w-4 h-4" /></button>}
        <div className="flex-1" />
        <span className="text-xs font-mono text-subtle bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{width}%</span>
        <button type="button" onClick={() => onRemove(block.id)} className="p-1.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"><X className="w-4 h-4" /></button>
      </div>

      <div ref={wrapperRef} className="p-3 select-none" style={{ display: 'flex', justifyContent: justifyMap[align] }}>
        <div className="relative" style={{ width: `${width}%`, minWidth: 48 }}>
          <img src={block.url} alt={block.caption || 'Imagem'} draggable={false}
            style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', maxHeight: 320 }} className="rounded" />
          <div onMouseDown={startResize} title="Arrastar para redimensionar"
            className="absolute bottom-0 right-0 w-5 h-5 flex items-center justify-center cursor-nwse-resize rounded-tl bg-sigma-500 hover:bg-sigma-600 z-10">
            <GripVertical className="w-3 h-3 text-white rotate-45" />
          </div>
        </div>
      </div>

      <div className="px-4 pb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-subtle w-6">10%</span>
          <input type="range" min={10} max={100} value={width} onChange={e => onPatch(block.id, { width: +e.target.value })}
            className="flex-1 accent-sigma-500 cursor-pointer" />
          <span className="text-xs text-subtle w-8 text-right">100%</span>
        </div>
      </div>
      <div className="px-3 pb-3">
        <input value={block.caption} onChange={e => onPatch(block.id, { caption: e.target.value })}
          placeholder="Legenda da imagem (opcional)..." className="w-full input-base px-3 py-1.5 text-xs" />
      </div>
    </div>
  );
}

// ── Row block (imagem + texto lado a lado) ────────────────────────
function RowBlockView({ block, idx, total, onPatch, onRemove, onMove }: {
  block: RowBlock; idx: number; total: number;
  onPatch: (id: string, p: any) => void; onRemove: (id: string) => void; onMove: (i: number, d: 'up'|'down') => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgW  = block.imageWidth ?? 35;
  const textW = 100 - imgW;

  const startResize = useResize(
    () => block.imageWidth ?? 35,
    w => onPatch(block.id, { imageWidth: Math.max(15, Math.min(70, w)) }),
    wrapperRef,
  );

  const imgCol = (
    <div className="relative flex-shrink-0 select-none" style={{ width: `${imgW}%` }}>
      <img src={block.url} alt={block.caption || 'Imagem'} draggable={false}
        style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', maxHeight: 320, borderRadius: 6 }} />
      {/* Resize handle — no lado interno (entre img e texto) */}
      <div
        onMouseDown={startResize}
        title="Arrastar para redimensionar"
        className={`absolute top-1/2 -translate-y-1/2 w-4 h-8 flex items-center justify-center cursor-ew-resize bg-sigma-500 hover:bg-sigma-600 rounded z-10 ${block.imagePosition === 'left' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'}`}
      >
        <GripVertical className="w-3 h-3 text-white" />
      </div>
    </div>
  );

  const textCol = (
    <div className="flex-1 min-w-0" style={{ width: `${textW}%` }}>
      <textarea value={block.text} onChange={e => onPatch(block.id, { text: e.target.value })}
        placeholder="Digite o texto ao lado da imagem..." spellCheck lang="pt-BR"
        className="w-full h-full input-base px-3 py-2 resize-none text-sm leading-relaxed"
        style={{ minHeight: 120 }} />
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs text-subtle font-medium">Imagem:</span>
        <button type="button" onClick={() => onPatch(block.id, { imagePosition: 'left' })}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${block.imagePosition === 'left' ? 'bg-sigma-100 dark:bg-sigma-900/40 text-sigma-600' : 'text-subtle hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
          <AlignLeft className="w-3.5 h-3.5" /> Esquerda
        </button>
        <button type="button" onClick={() => onPatch(block.id, { imagePosition: 'right' })}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${block.imagePosition === 'right' ? 'bg-sigma-100 dark:bg-sigma-900/40 text-sigma-600' : 'text-subtle hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
          <AlignRight className="w-3.5 h-3.5" /> Direita
        </button>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
        {idx > 0 && <button type="button" onClick={() => onMove(idx, 'up')} className="p-1.5 rounded text-subtle hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronUp className="w-4 h-4" /></button>}
        {idx < total - 1 && <button type="button" onClick={() => onMove(idx, 'down')} className="p-1.5 rounded text-subtle hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronDown className="w-4 h-4" /></button>}
        <div className="flex-1" />
        <span className="text-xs font-mono text-subtle bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{imgW}% img</span>
        <button type="button" onClick={() => onRemove(block.id)} className="p-1.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"><X className="w-4 h-4" /></button>
      </div>

      {/* Columns */}
      <div ref={wrapperRef} className="flex gap-3 p-3" style={{ alignItems: 'flex-start' }}>
        {block.imagePosition === 'left' ? <>{imgCol}{textCol}</> : <>{textCol}{imgCol}</>}
      </div>

      {/* Width slider */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-subtle">Img 15%</span>
          <input type="range" min={15} max={70} value={imgW} onChange={e => onPatch(block.id, { imageWidth: +e.target.value })}
            className="flex-1 accent-sigma-500 cursor-pointer" />
          <span className="text-xs text-subtle">70%</span>
        </div>
      </div>

      {/* Caption */}
      <div className="px-3 pb-3">
        <input value={block.caption} onChange={e => onPatch(block.id, { caption: e.target.value })}
          placeholder="Legenda da imagem (opcional)..." className="w-full input-base px-3 py-1.5 text-xs" />
      </div>
    </div>
  );
}

// ── Small button helpers ──────────────────────────────────────────
function MoveBtn({ dir, onClick }: { dir: 'up'|'down'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={dir === 'up' ? 'Mover para cima' : 'Mover para baixo'}
      className="w-6 h-6 bg-gray-600 text-white rounded flex items-center justify-center hover:bg-sigma-600 transition-colors">
      {dir === 'up' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
    </button>
  );
}
function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="Remover bloco"
      className="w-6 h-6 bg-red-500 text-white rounded flex items-center justify-center hover:bg-red-600 transition-colors">
      <X className="w-3.5 h-3.5" />
    </button>
  );
}

// ── initBlocks ────────────────────────────────────────────────────
export function initBlocks(bodyData: any): Block[] {
  if (!bodyData) return [{ type: 'text', id: crypto.randomUUID(), content: '' }];
  if (typeof bodyData === 'string') return [{ type: 'text', id: crypto.randomUUID(), content: bodyData }];
  if (Array.isArray(bodyData) && bodyData.length > 0) return bodyData as Block[];
  return [{ type: 'text', id: crypto.randomUUID(), content: '' }];
}
