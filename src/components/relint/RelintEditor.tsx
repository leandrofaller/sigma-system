'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Save, Send, Edit3, Loader2, Sparkles } from 'lucide-react';
import { generateRelintNumber, formatDate, getClassificationColor } from '@/lib/utils';
import { RelintPreview } from './RelintPreview';

interface Props {
  templates: any[];
  groups: any[];
  userId: string;
  userRole: string;
  defaultGroupId?: string;
  initialData?: any;
}

export function RelintEditor({ templates, groups, userId, userRole, defaultGroupId, initialData }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState('');
  const [activeView, setActiveView] = useState<'split' | 'edit' | 'preview'>('split');

  const defaultTemplate = templates.find((t) => t.isDefault) || templates[0];

  const [form, setForm] = useState({
    number: initialData?.number || generateRelintNumber('RELINT'),
    date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    subject: initialData?.subject || '',
    diffusion: initialData?.diffusion || '',
    classification: initialData?.classification || 'RESERVADO',
    groupId: initialData?.groupId || defaultGroupId || '',
    templateId: initialData?.templateId || defaultTemplate?.id || '',
    status: initialData?.status || 'DRAFT',
    content: {
      introduction: initialData?.content?.introduction || '',
      body: initialData?.content?.body || '',
      conclusion: initialData?.content?.conclusion || '',
      recommendations: initialData?.content?.recommendations || '',
      diffusionPrev: initialData?.content?.diffusionPrev ?? '***',
      reference: initialData?.content?.reference ?? '***',
      annexes: initialData?.content?.annexes ?? '***',
    },
  });

  const update = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateContent = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, content: { ...prev.content, [field]: value } }));
  }, []);

  const handleAI = async (field: string, prompt: string) => {
    setAiLoading(field);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: prompt,
          context: `Assunto do relatório: ${form.subject}. ${field === 'body' ? `Introdução: ${form.content.introduction}` : ''}`,
        }),
      });
      const data = await res.json();
      updateContent(field, data.response);
    } finally {
      setAiLoading('');
    }
  };

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
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Número do Relatório</label>
            <input value={form.number} onChange={(e) => update('number', e.target.value)}
              className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Data</label>
            <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)}
              className={inputCls} />
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
            <label className="block text-xs font-medium text-subtle mb-1.5">Classificação</label>
            <select value={form.classification} onChange={(e) => update('classification', e.target.value)}
              className={inputCls}>
              {['RESERVADO', 'CONFIDENCIAL', 'SECRETO', 'ULTRA_SECRETO'].map((c) => (
                <option key={c} value={c}>{c.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Grupo / Setor *</label>
            <select value={form.groupId} onChange={(e) => update('groupId', e.target.value)}
              className={inputCls}>
              <option value="">Selecione...</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Template</label>
            <select value={form.templateId} onChange={(e) => update('templateId', e.target.value)}
              className={inputCls}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Seções de texto */}
      {[
        { key: 'introduction', label: 'Introdução', rows: 4, placeholder: 'Descreva o contexto e objetivo do relatório...',
          aiPrompt: `Escreva uma introdução profissional para um relatório de inteligência sobre: ${form.subject}` },
        { key: 'body', label: 'Corpo do Relatório', rows: 8, placeholder: 'Descreva os fatos, análises e informações coletadas...',
          aiPrompt: `Escreva o corpo de um relatório de inteligência sobre: ${form.subject}. Inclua análise técnica e pontos críticos.` },
        { key: 'conclusion', label: 'Conclusão', rows: 4, placeholder: 'Apresente as conclusões baseadas nas informações...',
          aiPrompt: `Escreva uma conclusão para um relatório de inteligência sobre: ${form.subject}` },
        { key: 'recommendations', label: 'Recomendações (Opcional)', rows: 4, placeholder: 'Liste as recomendações e medidas sugeridas...',
          aiPrompt: `Escreva recomendações técnicas para um relatório de inteligência sobre: ${form.subject}` },
      ].map(({ key, label, rows, placeholder, aiPrompt }) => (
        <div key={key} className="card p-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-title">{label}</label>
            <button onClick={() => handleAI(key, aiPrompt)} disabled={!!aiLoading}
              className="flex items-center gap-1.5 text-xs text-sigma-600 dark:text-sigma-400 font-medium bg-sigma-50 dark:bg-sigma-900/20 px-2.5 py-1.5 rounded-lg hover:bg-sigma-100 dark:hover:bg-sigma-900/30 transition-colors disabled:opacity-50">
              {aiLoading === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Gerar com IA
            </button>
          </div>
          <textarea
            value={(form.content as any)[key]}
            onChange={(e) => updateContent(key, e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="w-full input-base px-4 py-3 resize-none leading-relaxed"
          />
        </div>
      ))}
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
