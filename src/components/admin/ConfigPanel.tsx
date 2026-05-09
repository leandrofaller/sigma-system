'use client';

import { useState } from 'react';
import { Save, Loader2, Palette, Brain, MapPin, HardDrive, FileText } from 'lucide-react';

interface Props {
  configs: Record<string, any>;
}

export function ConfigPanel({ configs: initialConfigs }: Props) {
  const [configs, setConfigs] = useState(initialConfigs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (key: string, value: any) => {
    setConfigs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const SectionCard = ({ icon: Icon, title, children }: any) => (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5 pb-4 card-header">
        <div className="w-8 h-8 icon-badge-sigma rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="font-semibold text-title">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );

  const Field = ({ label, children }: any) => (
    <div>
      <label className="block text-xs font-medium text-subtle mb-1.5">{label}</label>
      {children}
    </div>
  );

  const inputCls = 'w-full input-base px-3 py-2';

  const Input = (props: any) => <input {...props} className={inputCls} />;
  const Select = ({ children, ...props }: any) => (
    <select {...props} className={inputCls}>{children}</select>
  );

  const Toggle = ({ checked, onChange, label }: any) => (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-body">{label}</span>
      <button onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-sigma-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard icon={Brain} title="Inteligência Artificial">
          <Field label="Provedor Padrão">
            <Select value={configs.ai_provider?.provider || 'anthropic'}
              onChange={(e: any) => update('ai_provider', { ...configs.ai_provider, provider: e.target.value })}>
              <option value="anthropic">Anthropic (Claude) — chave: ANTHROPIC_API_KEY</option>
              <option value="gemini">Google Gemini — chave: GEMINI_API_KEY</option>
              <option value="openai">OpenAI (GPT) — chave: OPENAI_API_KEY</option>
            </Select>
          </Field>
          <Field label="Modelo">
            <Select value={configs.ai_provider?.model || 'claude-haiku-4-5-20251001'}
              onChange={(e: any) => update('ai_provider', { ...configs.ai_provider, model: e.target.value })}>
              <optgroup label="Anthropic — Claude">
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (rápido e econômico)</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (equilibrado)</option>
                <option value="claude-opus-4-7">Claude Opus 4.7 (mais capaz)</option>
              </optgroup>
              <optgroup label="Google — Gemini">
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (mais rápido)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (rápido)</option>
                <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash Latest</option>
                <option value="gemini-pro">Gemini Pro 1.0 (compatível)</option>
              </optgroup>
              <optgroup label="OpenAI — GPT">
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (econômico)</option>
              </optgroup>
            </Select>
          </Field>
        </SectionCard>

        <SectionCard icon={Palette} title="Aparência / História de Cobertura">
          <Field label="Modo de Exibição Pública">
            <Select value={configs.system_theme?.mode || 'cover'}
              onChange={(e: any) => update('system_theme', { ...configs.system_theme, mode: e.target.value })}>
              <option value="cover">Cobertura (Empresa de Entregas)</option>
              <option value="sigma">Sistema SIGMA (Direto)</option>
              <option value="hybrid">Híbrido</option>
            </Select>
          </Field>
          <Field label="Nome da Empresa de Cobertura">
            <Input value={configs.system_theme?.coverName || 'LogiTrack Express'}
              onChange={(e: any) => update('system_theme', { ...configs.system_theme, coverName: e.target.value })} />
          </Field>
          <Field label="Nome da Organização">
            <Input value={configs.organization_name?.name || ''}
              onChange={(e: any) => update('organization_name', { name: e.target.value })} />
          </Field>
        </SectionCard>

        <SectionCard icon={FileText} title="Numeração de Relatórios">
          <Field label="Prefixo (ex: RELINT)">
            <Input value={configs.relint_prefix?.prefix || 'RELINT'}
              onChange={(e: any) => update('relint_prefix', { prefix: e.target.value })} />
          </Field>
          <Field label="Sufixo (ex: AIP/SEJUS/RO)">
            <Input value={configs.relint_suffix?.suffix || 'AIP/SEJUS/RO'}
              onChange={(e: any) => update('relint_suffix', { suffix: e.target.value })} />
          </Field>
          <Field label="Próximo número (reiniciar contador)">
            <Input type="number" min="1"
              value={configs.relint_counter?.next || 1}
              onChange={(e: any) => update('relint_counter', {
                ...configs.relint_counter,
                next: parseInt(e.target.value) || 1,
                year: new Date().getFullYear(),
              })} />
          </Field>
          <p className="text-xs text-subtle">
            O número gerado seguirá o formato: <span className="font-mono">{configs.relint_prefix?.prefix || 'RELINT'} Nº 001/{new Date().getFullYear()}/{configs.relint_suffix?.suffix || 'AIP/SEJUS/RO'}</span>
          </p>
        </SectionCard>

        <SectionCard icon={HardDrive} title="Backup & Armazenamento">
          <Toggle checked={configs.backup_enabled?.enabled || false}
            label="Backup automático no Google Drive"
            onChange={(v: boolean) => update('backup_enabled', { enabled: v })} />
          <Field label="ID da Pasta no Google Drive">
            <Input placeholder="Deixe em branco para pasta raiz"
              value={configs.backup_folder?.folderId || ''}
              onChange={(e: any) => update('backup_folder', { folderId: e.target.value })} />
          </Field>
          <Field label="Tamanho Máximo de Upload (MB)">
            <Input type="number" min="1" max="500"
              value={configs.max_upload_size?.mb || 50}
              onChange={(e: any) => update('max_upload_size', { mb: parseInt(e.target.value) })} />
          </Field>
        </SectionCard>

        <SectionCard icon={MapPin} title="Monitoramento & Segurança">
          <Toggle checked={configs.geolocation_enabled?.enabled !== false}
            label="Rastreamento de geolocalização de usuários"
            onChange={(v: boolean) => update('geolocation_enabled', { enabled: v })} />
          <Toggle checked={configs.chat_enabled?.enabled !== false}
            label="Chat interno habilitado"
            onChange={(v: boolean) => update('chat_enabled', { enabled: v })} />
        </SectionCard>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors shadow-sm disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? '✓ Salvo!' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  );
}
