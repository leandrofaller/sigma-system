'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Send, Edit3, Loader2 } from 'lucide-react';
import { DebriefingPreview } from './DebriefingPreview';
import { BlockEditor, Block, initBlocks } from '@/components/relint/BlockEditor';

interface Props {
  groups: any[];
  userId: string;
  userRole: string;
  defaultGroupId?: string;
  initialData?: any;
}

function getInitialBody(initialData: any): Block[] {
  const body = initialData?.content?.body;
  return initBlocks(body);
}

const OPERATION_TYPES = [
  'Vigilância / Monitoramento',
  'Monitoramento',
  'Viagem',
  'Coleta de Informações',
  'Infiltração',
  'Interceptação',
  'Operação Especial',
  'Outro',
];

export function DebriefingEditor({ groups, userId, userRole, defaultGroupId, initialData }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'split' | 'edit' | 'preview'>('split');
  const isNew = !initialData?.id;

  const [form, setForm] = useState({
    number: initialData?.number || '',
    date: initialData?.date
      ? new Date(initialData.date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    missionDate: initialData?.missionDate
      ? new Date(initialData.missionDate).toISOString().split('T')[0]
      : '',
    missionCode: initialData?.missionCode || '',
    operationType: initialData?.operationType || '',
    operatives: initialData?.operatives || '',
    handler: initialData?.handler || '',
    location: initialData?.location || '',
    subject: initialData?.subject || '',
    diffusion: initialData?.diffusion || '',
    classification: initialData?.classification || 'RESERVADO',
    groupId: initialData?.groupId || defaultGroupId || '',
    status: initialData?.status || 'DRAFT',
    content: {
      body: getInitialBody(initialData) as any,
      agentAssessment: initialData?.content?.agentAssessment || '',
      conclusions: initialData?.content?.conclusions || '',
      recommendations: initialData?.content?.recommendations || '',
    },
  });

  useEffect(() => {
    if (isNew) {
      fetch('/api/debriefings/next-number', { method: 'POST' })
        .then((r) => r.json())
        .then((d) => { if (d.number) setForm((prev) => ({ ...prev, number: d.number })); })
        .catch(() => {
          setForm((prev) => ({
            ...prev,
            number: `DEBRIEFING Nº 001/${new Date().getFullYear()}/AIP/SEJUS/RO`,
          }));
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
      const url = initialData?.id ? `/api/debriefings/${initialData.id}` : '/api/debriefings';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, status }),
      });
      if (!res.ok) throw new Error('Erro ao salvar');
      router.push('/debriefings');
      router.refresh();
    } catch {
      alert('Erro ao salvar debriefing.');
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
            <label className="block text-xs font-medium text-subtle mb-1.5">Número</label>
            <input value={form.number} onChange={(e) => update('number', e.target.value)}
              placeholder="Aguardando geração automática..."
              className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Data do Debriefing</label>
            <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Data da Missão</label>
            <input type="date" value={form.missionDate} onChange={(e) => update('missionDate', e.target.value)}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Código da Missão</label>
            <input value={form.missionCode} onChange={(e) => update('missionCode', e.target.value)}
              placeholder="Ex: OP-2026-047"
              className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Tipo de Operação</label>
            <select value={form.operationType} onChange={(e) => update('operationType', e.target.value)}
              className={inputCls}>
              <option value="">Selecione...</option>
              {OPERATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-subtle mb-1.5">Assunto *</label>
            <input value={form.subject} onChange={(e) => update('subject', e.target.value)}
              placeholder="Ex: DEBRIEFING DE OPERAÇÃO DE VIGILÂNCIA EM UNIDADE PRISIONAL"
              className={`${inputCls} uppercase`} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-subtle mb-1.5">Policiais Envolvidos</label>
            <input value={form.operatives} onChange={(e) => update('operatives', e.target.value)}
              placeholder="Nomes dos policiais envolvidos na operação"
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Local da Operação</label>
            <input value={form.location} onChange={(e) => update('location', e.target.value)}
              placeholder="Ex: Porto Velho / RO"
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Difusão *</label>
            <input value={form.diffusion} onChange={(e) => update('diffusion', e.target.value)}
              placeholder="Ex: DIP/SEAP/DF"
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
          <div className="col-span-2">
            <label className="block text-xs font-medium text-subtle mb-1.5">Grupo / Setor *</label>
            <select value={form.groupId} onChange={(e) => update('groupId', e.target.value)}
              className={inputCls}>
              <option value="">Selecione...</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Relato da Missão */}
      <div className="card p-6">
        <label className="text-sm font-semibold text-title block mb-3">Relato da Missão</label>
        <BlockEditor
          blocks={(form.content as any).body as Block[]}
          onChange={updateBodyBlocks}
        />
      </div>

      {/* Avaliação e Conclusões */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-title mb-4">Avaliação e Conclusões</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Avaliação do Agente</label>
            <textarea value={(form.content as any).agentAssessment}
              onChange={(e) => updateContent('agentAssessment', e.target.value)}
              rows={3}
              placeholder="Avaliação de desempenho e conduta do(s) agente(s)..."
              className="w-full input-base px-3 py-2 text-sm resize-y" />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Conclusões</label>
            <textarea value={(form.content as any).conclusions}
              onChange={(e) => updateContent('conclusions', e.target.value)}
              rows={3}
              placeholder="Conclusões extraídas do debriefing..."
              className="w-full input-base px-3 py-2 text-sm resize-y" />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Recomendações</label>
            <textarea value={(form.content as any).recommendations}
              onChange={(e) => updateContent('recommendations', e.target.value)}
              rows={3}
              placeholder="Recomendações para operações futuras..."
              className="w-full input-base px-3 py-2 text-sm resize-y" />
          </div>
        </div>
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
            <DebriefingPreview form={form} />
          </div>
        )}
      </div>
    </div>
  );
}
