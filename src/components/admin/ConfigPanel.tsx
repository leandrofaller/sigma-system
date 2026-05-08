'use client';

import { useState } from 'react';
import { Save, Loader2, Key, Palette, Brain, MapPin, HardDrive, Shield } from 'lucide-react';

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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-50">
        <div className="w-8 h-8 bg-sigma-50 rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4 text-sigma-600" />
        </div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );

  const Field = ({ label, children }: any) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );

  const Input = (props: any) => (
    <input {...props} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sigma-400 focus:ring-2 focus:ring-sigma-400/10" />
  );

  const Select = ({ children, ...props }: any) => (
    <select {...props} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sigma-400 bg-white">
      {children}
    </select>
  );

  const Toggle = ({ checked, onChange, label }: any) => (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-700">{label}</span>
      <button onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-sigma-500' : 'bg-gray-200'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        {/* IA */}
        <SectionCard icon={Brain} title="Inteligência Artificial">
          <Field label="Provedor Padrão">
            <Select value={configs.ai_provider?.provider || 'openai'}
              onChange={(e: any) => update('ai_provider', { ...configs.ai_provider, provider: e.target.value })}>
              <option value="openai">OpenAI (GPT)</option>
              <option value="gemini">Google Gemini</option>
            </Select>
          </Field>
          <Field label="Modelo">
            <Select value={configs.ai_provider?.model || 'gpt-4o'}
              onChange={(e: any) => update('ai_provider', { ...configs.ai_provider, model: e.target.value })}>
              <option value="gpt-4o">GPT-4o (OpenAI)</option>
              <option value="gpt-4-turbo">GPT-4 Turbo (OpenAI)</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo (OpenAI)</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
              <option value="gemini-pro">Gemini Pro</option>
            </Select>
          </Field>
        </SectionCard>

        {/* Tema */}
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
          <Field label="Prefixo dos Relatórios">
            <Input value={configs.relint_prefix?.prefix || 'RELINT'}
              onChange={(e: any) => update('relint_prefix', { prefix: e.target.value })} />
          </Field>
        </SectionCard>

        {/* Backup */}
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

        {/* Segurança */}
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
