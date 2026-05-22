'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Minus, Highlighter,
  Undo2, Redo2, Table as TableIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  content: string;
  onChange: (html: string) => void;
}

const HL_COLORS = ['#FEF08A', '#BBF7D0', '#BFDBFE', '#FCA5A5', '#E9D5FF', '#FED7AA'];
const TXT_COLORS = ['#000000', '#374151', '#6B7280', '#DC2626', '#D97706', '#16A34A', '#2563EB', '#7C3AED'];

export function RichTextEditor({ content, onChange }: Props) {
  const [showColor, setShowColor] = useState(false);
  const [showHL, setShowHL] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      UnderlineExt,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: content || '<p></p>',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!colorRef.current?.contains(e.target as Node)) setShowColor(false);
      if (!hlRef.current?.contains(e.target as Node)) setShowHL(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!editor) return null;

  const isInTable = editor.isActive('table');
  const currentColor = (editor.getAttributes('textStyle') as { color?: string }).color ?? '#000000';

  const Btn = ({ onClick, active, title, children }: {
    onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
  }) => (
    <button type="button" title={title} onClick={onClick}
      className={`p-1.5 rounded transition-colors leading-none flex items-center justify-center ${
        active
          ? 'bg-sigma-100 dark:bg-sigma-900/40 text-sigma-700 dark:text-sigma-300'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}>
      {children}
    </button>
  );

  const Sep = () => <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5 self-center flex-shrink-0" />;

  const tableOps: [string, () => void, boolean?][] = [
    ['← Coluna', () => editor.chain().focus().addColumnBefore().run()],
    ['Coluna →', () => editor.chain().focus().addColumnAfter().run()],
    ['↑ Linha', () => editor.chain().focus().addRowBefore().run()],
    ['Linha ↓', () => editor.chain().focus().addRowAfter().run()],
    ['Mesclar', () => editor.chain().focus().mergeCells().run()],
    ['Dividir', () => editor.chain().focus().splitCell().run()],
  ];

  const tableDestructive: [string, () => void][] = [
    ['✕ Col', () => editor.chain().focus().deleteColumn().run()],
    ['✕ Linha', () => editor.chain().focus().deleteRow().run()],
    ['✕ Tabela', () => editor.chain().focus().deleteTable().run()],
  ];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-visible bg-white dark:bg-gray-900 focus-within:border-sigma-400 transition-colors">

      {/* ── Main toolbar ── */}
      <div className="flex items-center flex-wrap gap-px px-1.5 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 rounded-t-xl sticky top-0 z-10">

        {/* History */}
        <Btn title="Desfazer (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="w-4 h-4" /></Btn>
        <Btn title="Refazer (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="w-4 h-4" /></Btn>
        <Sep />

        {/* Headings */}
        <Btn title="Parágrafo" active={!editor.isActive('heading')} onClick={() => editor.chain().focus().setParagraph().run()}>
          <span className="text-[11px] font-medium px-1">¶</span>
        </Btn>
        {([1, 2, 3] as const).map(l => (
          <Btn key={l} title={`Título ${l}`} active={editor.isActive('heading', { level: l })}
            onClick={() => editor.chain().focus().toggleHeading({ level: l }).run()}>
            <span className="text-[11px] font-bold w-5 text-center">H{l}</span>
          </Btn>
        ))}
        <Sep />

        {/* Basic formatting */}
        <Btn title="Negrito (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" /></Btn>
        <Btn title="Itálico (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" /></Btn>
        <Btn title="Sublinhado (Ctrl+U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline className="w-4 h-4" /></Btn>
        <Btn title="Tachado" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-4 h-4" /></Btn>
        <Sep />

        {/* Alignment */}
        <Btn title="Alinhar esquerda" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="w-4 h-4" /></Btn>
        <Btn title="Centralizar" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="w-4 h-4" /></Btn>
        <Btn title="Alinhar direita" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="w-4 h-4" /></Btn>
        <Btn title="Justificar" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify className="w-4 h-4" /></Btn>
        <Sep />

        {/* Lists */}
        <Btn title="Lista com marcadores" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" /></Btn>
        <Btn title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></Btn>
        <Sep />

        {/* Table + HR */}
        <Btn title="Inserir tabela 3×3" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon className="w-4 h-4" />
        </Btn>
        <Btn title="Linha horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="w-4 h-4" /></Btn>
        <Sep />

        {/* Highlight color picker */}
        <div ref={hlRef} className="relative">
          <Btn title="Realçar texto" active={editor.isActive('highlight')} onClick={() => setShowHL(v => !v)}>
            <Highlighter className="w-4 h-4" />
          </Btn>
          {showHL && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 shadow-xl flex gap-1">
              {HL_COLORS.map(c => (
                <button key={c} type="button" title={c}
                  onClick={() => { editor.chain().focus().toggleHighlight({ color: c }).run(); setShowHL(false); }}
                  className="w-5 h-5 rounded border border-gray-300 hover:scale-125 transition-transform flex-shrink-0"
                  style={{ background: c }} />
              ))}
              <button type="button" title="Remover realce"
                onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHL(false); }}
                className="w-5 h-5 rounded border border-gray-300 bg-white dark:bg-gray-700 text-gray-500 text-xs flex items-center justify-center hover:bg-red-50 flex-shrink-0">
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Text color picker */}
        <div ref={colorRef} className="relative">
          <Btn title="Cor do texto" onClick={() => setShowColor(v => !v)}>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xs font-bold leading-none" style={{ color: currentColor }}>A</span>
              <div className="w-4 h-0.5 rounded" style={{ background: currentColor }} />
            </div>
          </Btn>
          {showColor && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 shadow-xl">
              <div className="grid grid-cols-4 gap-1 mb-1">
                {TXT_COLORS.map(c => (
                  <button key={c} type="button" title={c}
                    onClick={() => { editor.chain().focus().setColor(c).run(); setShowColor(false); }}
                    className="w-5 h-5 rounded border border-gray-300 hover:scale-125 transition-transform"
                    style={{ background: c }} />
                ))}
              </div>
              <button type="button"
                onClick={() => { editor.chain().focus().unsetColor().run(); setShowColor(false); }}
                className="w-full text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 rounded py-0.5 border border-gray-200 dark:border-gray-600">
                Cor padrão
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Table toolbar — visible when cursor is inside a table ── */}
      {isInTable && (
        <div className="flex items-center flex-wrap gap-1 px-2 py-1.5 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 mr-1">Tabela:</span>
          {tableOps.map(([label, fn]) => (
            <button key={label} type="button" onClick={fn}
              className="px-2 py-0.5 rounded text-xs bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors">
              {label}
            </button>
          ))}
          <div className="w-px h-4 bg-blue-200 dark:bg-blue-700 mx-0.5" />
          {tableDestructive.map(([label, fn]) => (
            <button key={label} type="button" onClick={fn}
              className="px-2 py-0.5 rounded text-xs bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Editor area ── */}
      <EditorContent editor={editor} className="tiptap-editor" />
    </div>
  );
}
