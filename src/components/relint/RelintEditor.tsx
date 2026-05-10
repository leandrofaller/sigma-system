'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Send, Edit3, Loader2 } from 'lucide-react';
import { RelintPreview } from './RelintPreview';
import { BlockEditor, Block, initBlocks } from './BlockEditor';

interface Props {
  templates: any[];
  groups: any[];
  userId: string;
  userRole: string;
  defaultGroupId?: string;
  initialData?: any;
}

function getInitialBody(initialData: any): Block[] {
  const intro: string = initialData?.content?.introduction || '';
  const body = initialData?.content?.body;
  const bodyBlocks = initBlocks(body);
  // Migrate old documents: prepend introduction as first text block
  if (intro && !Array.isArray(body)) {
    return [{ type: 'text', id: crypto.randomUUID(), content: intro }, ...bodyBlocks];
  }
  return bodyBlocks;
}

const DOC_TYPES = ['RELINT', 'PEDIDO DE BUSCA'] as const;
type DocType = typeof DOC_TYPES[number];

function detectDocType(number: string): DocType {
  return number.startsWith('PEDIDO DE BUSCA') ? 'PEDIDO DE BUSCA' : 'RELINT';
}

function swapPrefix(number: string, newType: DocType): string {
  // Replace whatever prefix precedes " Nº " with the new type
  return number.replace(/^.+?(?= Nº )/, newType);
}

export function RelintEditor({ templates, groups, userId, userRole, defaultGroupId, initialData }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'split' | 'edit' | 'preview'>('split');
  const [docType, setDocType] = useState<DocType>(() =>
    detectDocType(initialData?.number || '')
  );

  const defaultTemplate = templates.find((t) => t.isDefault) || templates[0];
  const isNew = !initialData?.id;

  const [form, setForm] = useState({
    number: initialData?.number || '',
    date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    subject: initialData?.subject || '',
    diffusion: initialData?.diffusion || '',
    classification: initialData?.classification || 'RESERVADO',
    groupId: initialData?.groupId || defaultGroupId || '',
    templateId: initialData?.templateId || defaultTemplate?.id || '',
    status: initialData?.status || 'DRAFT',
    content: {
      body: getInitialBody(initialData) as any,
      conclusion: initialData?.content?.conclusion || '',
      recommendations: initialData?.content?.recommendations || '',
      diffusionPrev: initialData?.content?.diffusionPrev ?? '***',
      reference: initialData?.content?.reference ?? '***',
      annexes: initialData?.content?.annexes ?? '***',
    },
  });

  // Fetch sequential number for new documents
  useEffect(() => {
    if (isNew) {
      fetch('/api/relints/next-number', { method: 'POST' })
        .then((r) => r.json())
        .then((d) => { if (d.number) setForm((prev) => ({ ...prev, number: d.number })); })
        .catch(() => {
          setForm((prev) => ({
            ...prev,
            number: `RELINT Nº 001/${new Date().getFullYear()}/AIP/SEJUS/RO`,
          }));
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleDocTypeChange = useCallback((type: DocType) => {
    setDocType(type);
    setForm((prev) => ({
      ...prev,
      number: prev.number.includes(' Nº ') ? swapPrefix(prev.number, type) : prev.number,
    }));
  }, []);

  const updateContent = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, content: { ...prev.content, [field]: value } }));
  }, []);

  const updateBodyBlocks = useCallback((blocks: Block[]) => {
    setForm((prev) => ({ ...prev, content: { ...prev.content, body: blocks as any } }));
  }, []);

  const handleSave = async (status: 'DRAFT' | 'PUBLISHED') => {
    if (!form.subject || !form.diffusion || !form.groupId) {
      alert('Preencha: Assunto, Difusão e Grupo.');
      return;
    }
    setSaving(true);
    try {
      const method = initialData?.id ? 'PUT' : 'POST';
      const url = initialData?.id ? `/api/relints/${initialData.id}` : '/api/relints';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, status }),
      });
      if (!res.ok) throw new Error('Erro ao salvar');
      router.push('/relints');
      router.refresh();
    } catch {
      alert('Erro ao salvar relatório.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full input-base px-3 py-2 text-sm';

  const editor = (
    <div className="space-y-5">
      {/* Identificação */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-title mb-4 flex items-center gap-2">
          <Edit3 className="w-4 h-4" /> Identificação
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-subtle mb-1.5">Tipo de Documento</label>
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit mb-2">
              {DOC_TYPES.map((type) => (
                <button key={type} type="button" onClick={() => handleDocTypeChange(type)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    docType === type
                      ? 'bg-white dark:bg-gray-700 text-title shadow-sm'
                      : 'text-subtle hover:text-body'
                  }`}>
                  {type}
                </button>
              ))}
            </div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Número</label>
            <input value={form.number} onChange={(e) => update('number', e.target.value)}
              placeholder="Aguardando geração automática..."
              className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Data</label>
            <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Classificação</label>
            <select value={form.classification} onChange={(e) => update('classification', e.target.value)}
              className={inputCls}>
              {['RESERVADO', 'CONFIDENCIAL', 'SECRETO', 'ULTRA_SECRETO'].map((c) => (
                <option key={c} value={c}>{c.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-subtle mb-1.5">Assunto *</label>
            <input value={form.subject} onChange={(e) => update('subject', e.target.value)}
              placeholder="Ex: IMPLEMENTAÇÃO DE VISITAÇÃO EM UNIDADE PRISIONAL"
              className={`${inputCls} uppercase`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Difusão *</label>
            <input value={form.diffusion} onChange={(e) => update('diffusion', e.target.value)}
              placeholder="Ex: DIP/SEAP/DF"
              className={`${inputCls} uppercase`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Difusão anterior</label>
            <input value={(form.content as any).diffusionPrev} onChange={(e) => updateContent('diffusionPrev', e.target.value)}
              placeholder="*** ou preencha"
              className={`${inputCls} uppercase`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Referência</label>
            <input value={(form.content as any).reference} onChange={(e) => updateContent('reference', e.target.value)}
              placeholder="*** ou número do documento"
              className={`${inputCls} uppercase`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Anexo(s)</label>
            <input value={(form.content as any).annexes} onChange={(e) => updateContent('annexes', e.target.value)}
              placeholder="*** ou descreva os anexos"
              className={`${inputCls} uppercase`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Grupo / Setor *</label>
            <select value={form.groupId} onChange={(e) => update('groupId', e.target.value)}
              className={inputCls}>
              <option value="">Selecione...</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Corpo do Relatório */}
      <div className="card p-6">
        <label className="text-sm font-semibold text-title block mb-3">Corpo do Relatório</label>
        <BlockEditor
          blocks={(form.content as any).body as Block[]}
          onChange={updateBodyBlocks}
        />
      </div>

    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-1">
          {([['split', 'Lado a Lado'], ['edit', 'Edição'], ['preview', 'Visualização']] as const).map(([view, label]) => (
            <button key={view} onClick={() => setActiveView(view)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                ${activeView === view
                  ? 'bg-white dark:bg-gray-700 text-title shadow-sm'
                  : 'text-subtle hover:text-body'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleSave('DRAFT')} disabled={saving}
            className="flex items-center gap-2 text-sm font-medium text-body border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Rascunho
          </button>
          <button onClick={() => handleSave('PUBLISHED')} disabled={saving}
            className="flex items-center gap-2 text-sm font-medium text-white bg-sigma-600 hover:bg-sigma-700 px-4 py-2 rounded-xl transition-colors disabled:opacity-50 shadow-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Publicar
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className={`${activeView === 'split' ? 'grid lg:grid-cols-2 gap-4' : ''}`}>
        {(activeView === 'edit' || activeView === 'split') && (
          <div className={activeView === 'split' ? 'overflow-y-auto max-h-[calc(100vh-14rem)]' : ''}>
            {editor}
          </div>
        )}
        {(activeView === 'preview' || activeView === 'split') && (
          <div className={activeView === 'split' ? 'overflow-y-auto max-h-[calc(100vh-14rem)]' : ''}>
            <RelintPreview form={form} />
          </div>
        )}
      </div>
    </div>
  );
}
