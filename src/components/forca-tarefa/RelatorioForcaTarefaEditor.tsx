'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Send, Edit3, Loader2 } from 'lucide-react';
import { RelatorioForcaTarefaPreview } from './RelatorioForcaTarefaPreview';
import { calcularIIP, IIP_FACTORS } from '@/lib/iip';

interface Props {
  groups: any[];
  userId: string;
  userName: string;
  userRole: string;
  defaultGroupId?: string;
  initialData?: any;
}

const LEGAL_TEXT = `"Declaro que as informações registradas neste relatório observam os princípios da necessidade de conhecer, compartimentação da informação, proteção do sigilo investigativo e demais normas aplicáveis à atividade de inteligência e investigação criminal."`;

const ALVOS_OPTIONS = [
  'Organização criminosa com atuação prisional',
  'Organização criminosa estadual',
  'Organização criminosa nacional',
  'Tráfico de drogas',
  'Tráfico de armas',
  'Lavagem de dinheiro',
  'Crimes contra agentes públicos',
  'Fuga ou resgate de presos',
  'Outros',
];

const FACCOES_OPTIONS = [
  'PCC',
  'CV',
  'TCP',
  'Primeiro Comando do Panda',
  'Comando Classe A',
  'Grupo independente',
  'Não identificado',
];

const RESULTADOS_OPTIONS = [
  'Prisões Efetuadas',
  'Mandados cumpridos',
  'Drogas apreendidas',
  'Armas apreendidas',
  'Valores apreendidos',
  'Liderança criminosa capturada',
  'Estrutura financeira identificada',
  'Aparelhos celulares apreendidos',
];

const RISCO_OPTIONS = [
  { value: 'BAIXO', label: 'Baixo', color: 'border-green-500/25 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/15' },
  { value: 'MÉDIO', label: 'Médio', color: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/15' },
  { value: 'ALTO', label: 'Alto', color: 'border-orange-500/25 bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/15' },
  { value: 'CRÍTICO', label: 'Crítico', color: 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/15' }
];

const MUNICIPIOS_RO = [
  'Porto Velho',
  'Ji-Paraná',
  'Ariquemes',
  'Cacoal',
  'Vilhena',
  'Guajará-Mirim',
  'Rolim de Moura',
  'Jaru',
  'Ouro Preto do Oeste',
  'Pimenta Bueno',
  'Espigão do Oeste',
  'Machadinho do Oeste',
  'Alta Floresta do Oeste',
  'Buritis',
  'Presidente Médici'
];

export function RelatorioForcaTarefaEditor({ groups, userId, userName, userRole, defaultGroupId, initialData }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'split' | 'edit' | 'preview'>('split');
  const [declaracaoAceita, setDeclaracaoAceita] = useState(false);

  const isNew = !initialData?.id;

  const [form, setForm] = useState({
    number: initialData?.number || '',
    date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    periodoInicio: initialData?.periodoInicio ? new Date(initialData.periodoInicio).toISOString().split('T')[0] : '',
    periodoFim: initialData?.periodoFim ? new Date(initialData.periodoFim).toISOString().split('T')[0] : '',
    forcaTarefa: initialData?.forcaTarefa || '',
    status: initialData?.status || 'DRAFT',
    groupId: initialData?.groupId || defaultGroupId || '',
    municipio: initialData?.municipio || 'Porto Velho',
    faccoes: initialData?.faccoes || [],
    iipFactors: initialData?.iipFactors || [],
    content: {
      identificacao: {
        servidor: initialData?.content?.identificacao?.servidor || userName,
        matricula: initialData?.content?.identificacao?.matricula || '',
        unidadeOrigem: initialData?.content?.identificacao?.unidadeOrigem || '',
      },
      resumoExecutivo: initialData?.content?.resumoExecutivo || '',
      participacaoOperacional: {
        inteligencia: initialData?.content?.participacaoOperacional?.inteligencia ?? 0,
        ostensiva: initialData?.content?.participacaoOperacional?.ostensiva ?? 0,
        mandados: initialData?.content?.participacaoOperacional?.mandados ?? 0,
        monitoramento: initialData?.content?.participacaoOperacional?.monitoramento ?? 0,
        reunioes: initialData?.content?.participacaoOperacional?.reunioes ?? 0,
        outras: initialData?.content?.participacaoOperacional?.outras ?? 0,
      },
      alvosEstrategicos: {
        categorias: initialData?.content?.alvosEstrategicos?.categorias || [],
        descricao: initialData?.content?.alvosEstrategicos?.descricao || '',
      },
      faccoesRelacionadas: {
        categorias: initialData?.content?.faccoesRelacionadas?.categorias || initialData?.faccoes || [],
        observacoes: initialData?.content?.faccoesRelacionadas?.observacoes || '',
      },
      impactosSistemaPrisional: initialData?.content?.impactosSistemaPrisional || '',
      produtosInteligencia: {
        relatorios: initialData?.content?.produtosInteligencia?.relatorios ?? 0,
        informes: initialData?.content?.produtosInteligencia?.informes ?? 0,
        alertas: initialData?.content?.produtosInteligencia?.alertas ?? 0,
        analises: initialData?.content?.produtosInteligencia?.analises ?? 0,
        outros: initialData?.content?.produtosInteligencia?.outros ?? 0,
      },
      resultadosRelevantes: {
        categorias: initialData?.content?.resultadosRelevantes?.categorias || [],
        descricao: initialData?.content?.resultadosRelevantes?.descricao || '',
      },
      avaliacaoRisco: {
        classificacao: initialData?.content?.avaliacaoRisco?.classificacao || 'BAIXO',
        justificativa: initialData?.content?.avaliacaoRisco?.justificativa || '',
      },
      demandasAip: initialData?.content?.demandasAip || '',
      observacoesDiretor: initialData?.content?.observacoesDiretor || '',
    },
  });

  // Cálculo do IIP de forma reativa
  const iipResult = calcularIIP(form.iipFactors || []);

  // Geração de numeração sequencial automática
  useEffect(() => {
    if (isNew) {
      fetch('/api/forca-tarefa/next-number', { method: 'POST' })
        .then((r) => r.json())
        .then((d) => { if (d.number) setForm((prev) => ({ ...prev, number: d.number })); })
        .catch(() => {
          setForm((prev) => ({
            ...prev,
            number: `RFT Nº 001/${new Date().getFullYear()}/AIP/SEJUS/RO`,
          }));
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateNestedContent = useCallback((parent: string, field: string, value: any) => {
    setForm((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        [parent]: {
          ...(prev.content as any)[parent],
          [field]: value
        }
      }
    }));
  }, []);

  const updateDirectContentField = useCallback((field: string, value: any) => {
    setForm((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        [field]: value
      }
    }));
  }, []);

  const handleFaccaoChange = (faccao: string, checked: boolean) => {
    const currentFaccoes = form.faccoes || [];
    const newFaccoes = checked 
      ? [...currentFaccoes, faccao]
      : currentFaccoes.filter((f: string) => f !== faccao);
      
    setForm((prev) => ({
      ...prev,
      faccoes: newFaccoes,
      content: {
        ...prev.content,
        faccoesRelacionadas: {
          ...prev.content.faccoesRelacionadas,
          categorias: newFaccoes
        }
      }
    }));
  };

  const handleFactorChange = (factorId: string, checked: boolean) => {
    const currentFactors = form.iipFactors || [];
    const newFactors = checked
      ? [...currentFactors, factorId]
      : currentFactors.filter((f: string) => f !== factorId);
    update('iipFactors', newFactors);
  };

  const handleCheckboxChange = (parent: string, listField: string, item: string, checked: boolean) => {
    if (parent === 'faccoesRelacionadas' && listField === 'categorias') {
      handleFaccaoChange(item, checked);
      return;
    }
    const currentList: string[] = (form.content as any)[parent]?.[listField] || [];
    let newList: string[];
    if (checked) {
      newList = [...currentList, item];
    } else {
      newList = currentList.filter((x) => x !== item);
    }
    updateNestedContent(parent, listField, newList);
  };

  const handleSave = async (status: 'DRAFT' | 'PUBLISHED') => {
    if (status === 'PUBLISHED' && !declaracaoAceita) {
      alert('Você deve aceitar a declaração de sigilo antes de publicar o relatório.');
      return;
    }
    if (!form.forcaTarefa || !form.periodoInicio || !form.periodoFim || !form.groupId || !form.municipio) {
      alert('Preencha os campos obrigatórios: Força-Tarefa, Município, Período de Referência e Setor/Grupo.');
      return;
    }

    setSaving(true);
    try {
      const method = initialData?.id ? 'PUT' : 'POST';
      const url = initialData?.id ? `/api/forca-tarefa/${initialData.id}` : '/api/forca-tarefa';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, status }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao salvar');
      }
      router.push('/forca-tarefa');
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar o relatório.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full input-base px-3 py-2 text-sm';
  const labelCls = 'block text-xs font-semibold text-subtle mb-1.5 uppercase tracking-wider';
  const sectionTitleCls = 'text-sm font-bold text-title border-b border-gray-100 dark:border-gray-800 pb-2 mb-4';

  const editorForm = (
    <div className="space-y-6 pb-20">
      {/* 1. IDENTIFICAÇÃO */}
      <div className="card p-6">
        <h3 className={sectionTitleCls}>1. Identificação</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>Número do Relatório</label>
            <input value={form.number} readOnly
              placeholder="Aguardando geração automática..."
              className={`${inputCls} font-mono bg-gray-100 dark:bg-gray-800/40 text-subtle cursor-not-allowed`} />
          </div>
          <div>
            <label className={labelCls}>Servidor</label>
            <input value={form.content.identificacao.servidor}
              onChange={(e) => updateNestedContent('identificacao', 'servidor', e.target.value)}
              className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Matrícula *</label>
            <input value={form.content.identificacao.matricula}
              onChange={(e) => updateNestedContent('identificacao', 'matricula', e.target.value)}
              placeholder="Ex: 300.123-4"
              className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Unidade de Origem *</label>
            <input value={form.content.identificacao.unidadeOrigem}
              onChange={(e) => updateNestedContent('identificacao', 'unidadeOrigem', e.target.value)}
              placeholder="Ex: AIP / GAECO / CAPITAL"
              className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Força-Tarefa / Operação Integrada *</label>
            <input value={form.forcaTarefa}
              onChange={(e) => update('forcaTarefa', e.target.value.toUpperCase())}
              placeholder="Ex: FICCO / FTIP / GAECO"
              className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Município / Região de Atuação *</label>
            <select 
              value={MUNICIPIOS_RO.includes(form.municipio) ? form.municipio : (form.municipio ? 'Outro' : '')}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'Outro') {
                  update('municipio', '');
                } else {
                  update('municipio', val);
                }
              }}
              className={inputCls} required>
              <option value="">Selecione...</option>
              {MUNICIPIOS_RO.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="Outro">Outro (Digitar)...</option>
            </select>
          </div>
          {(!MUNICIPIOS_RO.includes(form.municipio) && form.municipio !== undefined) && (
            <div>
              <label className={labelCls}>Especificar Município *</label>
              <input value={form.municipio}
                onChange={(e) => update('municipio', e.target.value)}
                placeholder="Digite o nome do município"
                className={inputCls} required />
            </div>
          )}
          <div>
            <label className={labelCls}>Data de Referência (Início) *</label>
            <input type="date" value={form.periodoInicio}
              onChange={(e) => update('periodoInicio', e.target.value)}
              className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Data de Referência (Fim) *</label>
            <input type="date" value={form.periodoFim}
              onChange={(e) => update('periodoFim', e.target.value)}
              className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Data de Preenchimento</label>
            <input type="date" value={form.date}
              onChange={(e) => update('date', e.target.value)}
              className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Grupo / Setor *</label>
            <select value={form.groupId} onChange={(e) => update('groupId', e.target.value)}
              className={inputCls}>
              <option value="">Selecione...</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 2. RESUMO EXECUTIVO */}
      <div className="card p-6">
        <div className="flex justify-between items-center mb-2">
          <label className={labelCls}>2. Resumo Executivo</label>
          <span className={`text-[10px] font-semibold ${form.content.resumoExecutivo.length > 2000 ? 'text-red-500' : 'text-subtle'}`}>
            {form.content.resumoExecutivo.length} / 2000 caracteres
          </span>
        </div>
        <textarea
          rows={6}
          value={form.content.resumoExecutivo}
          onChange={(e) => updateDirectContentField('resumoExecutivo', e.target.value)}
          placeholder="Forneça uma síntese semanal dos fatos e atividades desempenhadas na força-tarefa..."
          className="w-full input-base p-3 text-sm"
        />
      </div>

      {/* 3. PARTICIPAÇÃO OPERACIONAL */}
      <div className="card p-6">
        <h3 className={sectionTitleCls}>3. Participação Operacional (Quantidades)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { key: 'inteligencia', label: 'Op. Inteligência' },
            { key: 'ostensiva', label: 'Op. Ostensivas' },
            { key: 'mandados', label: 'Mandados Cumpridos' },
            { key: 'monitoramento', label: 'Ações Monitoramento' },
            { key: 'reunioes', label: 'Reuniões Operacionais' },
            { key: 'outras', label: 'Outras Atividades' },
          ].map((item) => (
            <div key={item.key}>
              <label className="block text-[11px] font-medium text-body mb-1 truncate">{item.label}</label>
              <input
                type="number"
                min="0"
                value={(form.content.participacaoOperacional as any)[item.key]}
                onChange={(e) => updateNestedContent('participacaoOperacional', item.key, parseInt(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 4. ALVOS ESTRATÉGICOS ENVOLVIDOS */}
      <div className="card p-6">
        <h3 className={sectionTitleCls}>4. Alvos Estratégicos Envolvidos</h3>
        <label className="block text-[11px] font-medium text-subtle mb-2 uppercase">Categorias de Alvos</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {ALVOS_OPTIONS.map((opt) => {
            const isChecked = form.content.alvosEstrategicos.categorias.includes(opt);
            return (
              <label key={opt} className="flex items-start gap-2.5 text-xs text-body hover:text-title cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => handleCheckboxChange('alvosEstrategicos', 'categorias', opt, e.target.checked)}
                  className="rounded border-gray-300 text-sigma-600 focus:ring-sigma-500 mt-0.5"
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
        <div>
          <label className={labelCls}>Descrição Resumida dos Alvos</label>
          <textarea
            rows={3}
            value={form.content.alvosEstrategicos.descricao}
            onChange={(e) => updateNestedContent('alvosEstrategicos', 'descricao', e.target.value)}
            placeholder="Descreva de forma resumida e estratégica os alvos envolvidos no período..."
            className="w-full input-base p-3 text-sm"
          />
        </div>
      </div>

      {/* 5. FACÇÕES OU GRUPOS CRIMINOSOS RELACIONADOS */}
      <div className="card p-6">
        <h3 className={sectionTitleCls}>5. Facções ou Grupos Criminosos Relacionados</h3>
        <label className="block text-[11px] font-medium text-subtle mb-2 uppercase">Grupos Relacionados</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {FACCOES_OPTIONS.map((opt) => {
            const isChecked = (form.faccoes || []).includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2 text-xs text-body hover:text-title cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => handleCheckboxChange('faccoesRelacionadas', 'categorias', opt, e.target.checked)}
                  className="rounded border-gray-300 text-sigma-600 focus:ring-sigma-500"
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
        <div>
          <label className={labelCls}>Observações Estratégicas</label>
          <textarea
            rows={3}
            value={form.content.faccoesRelacionadas.observacoes}
            onChange={(e) => updateNestedContent('faccoesRelacionadas', 'observacoes', e.target.value)}
            placeholder="Informações sobre dinâmica, movimentações ou conflitos entre grupos criminosos..."
            className="w-full input-base p-3 text-sm"
          />
        </div>
      </div>

      {/* 6. IMPACTOS PARA O SISTEMA PRISIONAL */}
      <div className="card p-6">
        <label className={labelCls}>6. Impactos para o Sistema Prisional</label>
        <p className="text-[11px] text-subtle mb-2">Exemplos: ordens prisionais capturadas, identificação de lideranças criminosas, riscos de motins, planos de fuga, etc.</p>
        <textarea
          rows={4}
          value={form.content.impactosSistemaPrisional}
          onChange={(e) => updateDirectContentField('impactosSistemaPrisional', e.target.value)}
          placeholder="Insira dados com relevância para a Inteligência Penitenciária..."
          className="w-full input-base p-3 text-sm"
        />
      </div>

      {/* 7. PRODUTOS DE INTELIGÊNCIA PRODUZIDOS */}
      <div className="card p-6">
        <h3 className={sectionTitleCls}>7. Produtos de Inteligência Produzidos (Quantidades)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { key: 'relatorios', label: 'Relatórios' },
            { key: 'informes', label: 'Informes' },
            { key: 'alertas', label: 'Alertas' },
            { key: 'analises', label: 'Análises' },
            { key: 'outros', label: 'Outros' },
          ].map((item) => (
            <div key={item.key}>
              <label className="block text-[11px] font-medium text-body mb-1 truncate">{item.label}</label>
              <input
                type="number"
                min="0"
                value={(form.content.produtosInteligencia as any)[item.key]}
                onChange={(e) => updateNestedContent('produtosInteligencia', item.key, parseInt(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 8. RESULTADOS RELEVANTES */}
      <div className="card p-6">
        <h3 className={sectionTitleCls}>8. Resultados Relevantes</h3>
        <label className="block text-[11px] font-medium text-subtle mb-2 uppercase">Indicadores</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {RESULTADOS_OPTIONS.map((opt) => {
            const isChecked = form.content.resultadosRelevantes.categorias.includes(opt);
            return (
              <label key={opt} className="flex items-start gap-2.5 text-xs text-body hover:text-title cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => handleCheckboxChange('resultadosRelevantes', 'categorias', opt, e.target.checked)}
                  className="rounded border-gray-300 text-sigma-600 focus:ring-sigma-500 mt-0.5"
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
        <div>
          <label className={labelCls}>Descrição Resumida dos Resultados</label>
          <textarea
            rows={3}
            value={form.content.resultadosRelevantes.descricao}
            onChange={(e) => updateNestedContent('resultadosRelevantes', 'descricao', e.target.value)}
            placeholder="Prisões de impacto, apreensões significativas de entorpecentes ou armamentos..."
            className="w-full input-base p-3 text-sm"
          />
        </div>
      </div>

      {/* 9. AVALIAÇÃO DE RISCO */}
      <div className="card p-6">
        <h3 className={sectionTitleCls}>9. Avaliação de Risco</h3>
        <label className={labelCls}>Nível de Risco Operacional</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {RISCO_OPTIONS.map((opt) => {
            const isSelected = form.content.avaliacaoRisco.classificacao === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateNestedContent('avaliacaoRisco', 'classificacao', opt.value)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                  isSelected
                    ? opt.color + ' border-current scale-[1.03] shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 text-subtle hover:bg-gray-50 dark:hover:bg-gray-800/40'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div>
          <label className={labelCls}>Justificativa da Classificação</label>
          <textarea
            rows={3}
            value={form.content.avaliacaoRisco.justificativa}
            onChange={(e) => updateNestedContent('avaliacaoRisco', 'justificativa', e.target.value)}
            placeholder="Aponte fatores como reações faccionais, riscos de retaliação ou grau de periculosidade..."
            className="w-full input-base p-3 text-sm"
          />
        </div>
      </div>

      {/* 10. ÍNDICE DE IMPACTO PRISIONAL (IIP) */}
      <div className="card p-6 border-l-4 border-l-sigma-500 bg-sigma-500/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-title flex items-center gap-2">
              10. Índice de Impacto Prisional (IIP)
            </h3>
            <p className="text-[11px] text-subtle mt-0.5">Mapeamento automatizado de indicadores estratégicos e de risco prisional.</p>
          </div>
          
          {/* Card reativo do IIP */}
          <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="text-right">
              <span className="block text-[10px] font-bold text-subtle uppercase tracking-wider">Score IIP</span>
              <span className="text-lg font-black text-title">{iipResult.score} pts</span>
            </div>
            <div className="h-8 w-px bg-gray-100 dark:bg-gray-700" />
            <div>
              <span className="block text-[10px] font-bold text-subtle uppercase tracking-wider">Nível de Impacto</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${
                iipResult.level === 'CRITICAL' ? 'bg-red-500/20 text-red-600 dark:text-red-400 animate-pulse' :
                iipResult.level === 'HIGH' ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400' :
                iipResult.level === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                'bg-green-500/20 text-green-600 dark:text-green-400'
              }`}>
                {iipResult.level === 'CRITICAL' ? 'CRÍTICO' :
                 iipResult.level === 'HIGH' ? 'ALTO' :
                 iipResult.level === 'MEDIUM' ? 'MÉDIO' : 'BAIXO'}
              </span>
            </div>
          </div>
        </div>

        {/* Recomendação de Ação Automática */}
        <div className="mb-6 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-xs">
          <strong className="text-title block mb-1">Ação Recomendada (Automática):</strong>
          <span className="text-body font-medium">{iipResult.acaoRecomendada}</span>
          {iipResult.alertaAtivo && (
            <span className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wider">
              ⚠️ Alerta Crítico Direto Ativado para a Direção da AIP
            </span>
          )}
        </div>

        {/* Grid de checkboxes do IIP */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-subtle uppercase tracking-wider mb-2">Fatores de Impacto Identificados</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {IIP_FACTORS.map((factor) => {
              const isChecked = (form.iipFactors || []).includes(factor.id);
              return (
                <label key={factor.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                  isChecked 
                    ? factor.critico 
                      ? 'border-red-500/30 bg-red-500/5 text-title' 
                      : 'border-sigma-500/30 bg-sigma-500/5 text-title'
                    : 'border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-800/10 hover:border-gray-200 dark:hover:border-gray-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => handleFactorChange(factor.id, e.target.checked)}
                    className={`rounded border-gray-300 mt-0.5 ${
                      factor.critico ? 'text-red-600 focus:ring-red-500' : 'text-sigma-600 focus:ring-sigma-500'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{factor.label}</span>
                      <span className={`text-[10px] font-black shrink-0 px-1.5 py-0.5 rounded-md ${
                        factor.critico 
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400' 
                          : 'bg-gray-100 dark:bg-gray-800 text-subtle'
                      }`}>
                        +{factor.pontos}
                      </span>
                    </div>
                    {factor.critico && (
                      <span className="inline-block text-[9px] font-bold text-red-500 uppercase tracking-wider mt-0.5">
                        Fator Crítico (Dispara Alerta Direto)
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* 11. DEMANDAS PARA A AIP */}
      <div className="card p-6">
        <label className={labelCls}>11. Demandas para a AIP</label>
        <p className="text-[11px] text-subtle mb-2">Exemplos: compartilhamento de relatórios de inteligência, levantamento de antecedentes penais, dados analíticos, etc.</p>
        <textarea
          rows={3}
          value={form.content.demandasAip}
          onChange={(e) => updateDirectContentField('demandasAip', e.target.value)}
          placeholder="Descreva as demandas de apoio analítico da AIP..."
          className="w-full input-base p-3 text-sm"
        />
      </div>

      {/* 12. OBSERVAÇÕES ESTRATÉGICAS AO DIRETOR DE INTELIGÊNCIA */}
      <div className="card p-6">
        <label className={labelCls}>12. Observações ao Diretor de Inteligência</label>
        <textarea
          rows={3}
          value={form.content.observacoesDiretor}
          onChange={(e) => updateDirectContentField('observacoesDiretor', e.target.value)}
          placeholder="Observações estratégicas de acompanhamento geral..."
          className="w-full input-base p-3 text-sm"
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="card px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-1">
          {([['split', 'Lado a Lado'], ['edit', 'Edição'], ['preview', 'Visualização']] as const).map(([view, label]) => (
            <button key={view} onClick={() => setActiveView(view)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all
                ${activeView === view
                  ? 'bg-white dark:bg-gray-700 text-title shadow-sm'
                  : 'text-subtle hover:text-body'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleSave('DRAFT')} disabled={saving}
            className="flex items-center gap-2 text-xs font-bold text-body border border-gray-200 dark:border-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Rascunho
          </button>
          <button onClick={() => handleSave('PUBLISHED')} disabled={saving}
            className="flex items-center gap-2 text-xs font-bold text-white bg-sigma-600 hover:bg-sigma-700 px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 shadow-sm">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Publicar
          </button>
        </div>
      </div>

      {/* Conteúdo com Split Screen */}
      <div className={`${activeView === 'split' ? 'grid lg:grid-cols-2 gap-4' : ''}`}>
        {(activeView === 'edit' || activeView === 'split') && (
          <div className={activeView === 'split' ? 'overflow-y-auto max-h-[calc(100vh-14rem)] pr-1 scrollbar-thin' : ''}>
            {editorForm}
          </div>
        )}
        {(activeView === 'preview' || activeView === 'split') && (
          <div className={activeView === 'split' ? 'overflow-y-auto max-h-[calc(100vh-14rem)]' : ''}>
            <RelatorioForcaTarefaPreview form={form as any} />
            
            {/* Aceite de Declaração para Publicação */}
            {activeView === 'split' && (
              <div className="card p-4 mt-4 border-l-4 border-l-sigma-500 bg-sigma-500/5">
                <label className="flex items-start gap-2.5 text-xs text-body hover:text-title cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={declaracaoAceita}
                    onChange={(e) => setDeclaracaoAceita(e.target.checked)}
                    className="rounded border-gray-300 text-sigma-600 focus:ring-sigma-500 mt-0.5"
                  />
                  <span>
                    <strong>Declaração de Sigilo:</strong> {LEGAL_TEXT.replace(/"/g, '')}
                  </span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Barra de declaração quando não está em Split Screen */}
      {activeView !== 'split' && (
        <div className="card p-4 border-l-4 border-l-sigma-500 bg-sigma-500/5 mt-2">
          <label className="flex items-start gap-2.5 text-xs text-body hover:text-title cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={declaracaoAceita}
              onChange={(e) => setDeclaracaoAceita(e.target.checked)}
              className="rounded border-gray-300 text-sigma-600 focus:ring-sigma-500 mt-0.5"
            />
            <span>
              <strong>Declaração de Sigilo:</strong> {LEGAL_TEXT.replace(/"/g, '')}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
