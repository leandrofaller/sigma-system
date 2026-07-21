'use client';

import { useState } from 'react';
import { Save, Loader2, Palette, Brain, MapPin, HardDrive, FileText, Eye, EyeOff, CheckCircle, RefreshCw } from 'lucide-react';

interface Props {
  configs: Record<string, any>;
}

const inputCls = 'w-full input-base px-3 py-2';

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

const Input = (props: any) => <input {...props} className={inputCls} />;
const Select = ({ children, ...props }: any) => (
  <select {...props} className={inputCls}>{children}</select>
);

const Toggle = ({ checked, onChange, label }: any) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-sm text-body">{label}</span>
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-sigma-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  </div>
);

export function ConfigPanel({ configs: initialConfigs }: Props) {
  const [configs, setConfigs] = useState(initialConfigs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const update = (key: string, value: any) => {
    setConfigs((prev) => ({ ...prev, [key]: value }));
  };

  const testAI = async () => {
    setTestingAI(true);
    setTestResult(null);
    try {
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs),
      });
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'Responda apenas: OK' }),
      });
      const data = await res.json();
      if (data.response && !data.response.startsWith('Erro')) {
        setTestResult({ ok: true, msg: 'Conexão bem-sucedida!' });
      } else {
        setTestResult({ ok: false, msg: data.response || 'Falha na conexão.' });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Erro de rede ao testar.' });
    } finally {
      setTestingAI(false);
    }
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

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard icon={Brain} title="Inteligência Artificial">
          <Field label="Provedor Padrão">
            <Select value={configs.ai_provider?.provider || 'groq'}
              onChange={(e: any) => {
                update('ai_provider', { ...configs.ai_provider, provider: e.target.value });
                setTestResult(null);
              }}>
              <option value="groq">Groq (LLaMA / Mixtral) — recomendado</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI (GPT)</option>
            </Select>
          </Field>
          <Field label="Modelo">
            <Select value={configs.ai_provider?.model || 'llama-3.3-70b-versatile'}
              onChange={(e: any) => update('ai_provider', { ...configs.ai_provider, model: e.target.value })}>
              <optgroup label="Groq — LLaMA / Mixtral">
                <option value="llama-3.3-70b-versatile">LLaMA 3.3 70B Versatile (recomendado)</option>
                <option value="llama-3.1-8b-instant">LLaMA 3.1 8B Instant (ultra-rápido)</option>
                <option value="llama3-70b-8192">LLaMA 3 70B</option>
                <option value="llama3-8b-8192">LLaMA 3 8B (rápido)</option>
                <option value="mixtral-8x7b-32768">Mixtral 8x7B (32k ctx)</option>
                <option value="gemma2-9b-it">Gemma 2 9B</option>
              </optgroup>
              <optgroup label="Anthropic — Claude">
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (rápido e econômico)</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (equilibrado)</option>
                <option value="claude-opus-4-7">Claude Opus 4.7 (mais capaz)</option>
              </optgroup>
              <optgroup label="Google — Gemini">
                <option value="gemini-3.5-flash">Gemini 3.5 Flash (recomendado)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              </optgroup>
              <optgroup label="OpenAI — GPT">
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (econômico)</option>
              </optgroup>
            </Select>
          </Field>
          {/* API Key field — saved in DB, no need to touch Coolify */}
          <Field label={`Chave de API — ${(configs.ai_provider?.provider || 'anthropic').toUpperCase()}`}>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={(() => {
                  const provider = configs.ai_provider?.provider || 'anthropic';
                  return configs[`${provider}_api_key`]?.key || '';
                })()}
                onChange={(e: any) => {
                  const provider = configs.ai_provider?.provider || 'anthropic';
                  update(`${provider}_api_key`, { key: e.target.value });
                  setTestResult(null);
                }}
                placeholder={
                  ({ groq: 'gsk_...', anthropic: 'sk-ant-...', gemini: 'AIza...', openai: 'sk-...' } as Record<string, string>)[
                    configs.ai_provider?.provider || 'groq'
                  ] || 'Cole sua chave aqui'
                }
                className={`${inputCls} pr-10 font-mono text-sm`}
              />
              <button type="button" onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-body transition-colors">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-subtle mt-1">
              A chave é armazenada no banco de dados e tem prioridade sobre variáveis de ambiente.
            </p>
          </Field>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={testAI} disabled={testingAI}
              className="flex items-center gap-2 text-sm font-medium border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
              {testingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Testar Conexão
            </button>
            <button
              type="button"
              onClick={() => {
                update('ai_provider', { provider: 'groq', model: 'llama-3.3-70b-versatile' });
                setTestResult(null);
              }}
              className="text-xs text-subtle hover:text-body underline underline-offset-2 transition-colors">
              Redefinir para Groq
            </button>
            {testResult && (
              <span className={`text-sm font-medium ${testResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {testResult.ok ? '✓' : '✗'} {testResult.msg}
              </span>
            )}
          </div>
        </SectionCard>

        <SectionCard icon={Palette} title="Aparência / História de Cobertura">
          <Field label="Modo de Exibição Pública">
            <Select value={configs.system_theme?.mode || 'cover'}
              onChange={(e: any) => update('system_theme', { ...configs.system_theme, mode: e.target.value })}>
              <option value="cover">Cobertura (Empresa de Entregas)</option>
              <option value="sigma">Sistema SIAIP (Direto)</option>
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
          <Field label="Tamanho do logotipo na barra lateral (px)">
            <div className="space-y-2">
              <Select
                value={configs.sidebar_logo_size?.px || 36}
                onChange={(e: any) => update('sidebar_logo_size', { px: parseInt(e.target.value) })}
              >
                <option value={24}>Pequeno — 24px</option>
                <option value={32}>Médio pequeno — 32px</option>
                <option value={36}>Médio — 36px (padrão)</option>
                <option value={48}>Grande — 48px</option>
                <option value={56}>Extra grande — 56px</option>
                <option value={64}>Máximo — 64px</option>
              </Select>
              <p className="text-xs text-subtle">
                Tamanho atual: <span className="font-mono font-medium">{configs.sidebar_logo_size?.px || 36}px</span>. Salve e recarregue a página para ver o efeito.
              </p>
            </div>
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
          <Field label="Provedor de Nuvem para Backups">
            <Select
              value={configs.backup_cloud?.provider || 'none'}
              onChange={(e: any) =>
                update('backup_cloud', { ...configs.backup_cloud, provider: e.target.value })
              }
            >
              <option value="none">Sem nuvem (somente local)</option>
              <option value="google_drive">Google Drive</option>
              <option value="onedrive">OneDrive (Microsoft 365)</option>
            </Select>
          </Field>

          {(configs.backup_cloud?.provider || 'none') === 'google_drive' && (
            <>
              <Field label="ID da Pasta no Google Drive">
                <Input
                  placeholder="Deixe em branco para pasta raiz"
                  value={configs.backup_cloud?.googleDrive?.folderId || ''}
                  onChange={(e: any) =>
                    update('backup_cloud', {
                      ...configs.backup_cloud,
                      googleDrive: { folderId: e.target.value },
                    })
                  }
                />
              </Field>
              <p className="text-xs text-subtle -mt-2">
                As credenciais do Google Drive são configuradas via variáveis de ambiente{' '}
                <code className="font-mono">GOOGLE_DRIVE_CLIENT_ID</code>,{' '}
                <code className="font-mono">GOOGLE_DRIVE_CLIENT_SECRET</code> e{' '}
                <code className="font-mono">GOOGLE_DRIVE_REFRESH_TOKEN</code>.
              </p>
            </>
          )}

          {(configs.backup_cloud?.provider || 'none') === 'onedrive' && (
            <>
              <Field label="Tenant ID (ID do Diretório Azure)">
                <Input
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={configs.backup_cloud?.onedrive?.tenantId || ''}
                  onChange={(e: any) =>
                    update('backup_cloud', {
                      ...configs.backup_cloud,
                      onedrive: { ...configs.backup_cloud?.onedrive, tenantId: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Client ID (ID do Aplicativo Azure)">
                <Input
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={configs.backup_cloud?.onedrive?.clientId || ''}
                  onChange={(e: any) =>
                    update('backup_cloud', {
                      ...configs.backup_cloud,
                      onedrive: { ...configs.backup_cloud?.onedrive, clientId: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Client Secret (Segredo do Aplicativo)">
                <Input
                  type="password"
                  placeholder="Cole o segredo do aplicativo Azure"
                  value={configs.backup_cloud?.onedrive?.clientSecret || ''}
                  onChange={(e: any) =>
                    update('backup_cloud', {
                      ...configs.backup_cloud,
                      onedrive: { ...configs.backup_cloud?.onedrive, clientSecret: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Drive ID (opcional — deixe vazio para OneDrive pessoal/padrão)">
                <Input
                  placeholder="b!xxxxxx... (ID do drive do SharePoint ou do usuário)"
                  value={configs.backup_cloud?.onedrive?.driveId || ''}
                  onChange={(e: any) =>
                    update('backup_cloud', {
                      ...configs.backup_cloud,
                      onedrive: { ...configs.backup_cloud?.onedrive, driveId: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Folder ID no OneDrive (opcional — deixe vazio para pasta raiz)">
                <Input
                  placeholder="ID da pasta de destino"
                  value={configs.backup_cloud?.onedrive?.folderId || ''}
                  onChange={(e: any) =>
                    update('backup_cloud', {
                      ...configs.backup_cloud,
                      onedrive: { ...configs.backup_cloud?.onedrive, folderId: e.target.value },
                    })
                  }
                />
              </Field>
              <p className="text-xs text-subtle -mt-2">
                Crie um aplicativo no{' '}
                <strong>Portal Azure → Registros de Aplicativo</strong>, conceda a permissão{' '}
                <code className="font-mono">Files.ReadWrite.All</code> (Aplicativo) e gere um segredo.
              </p>
            </>
          )}

          <Field label="Tamanho Máximo de Upload (MB)">
            <Input type="number" min="1" max="500"
              value={configs.max_upload_size?.mb || 50}
              onChange={(e: any) => update('max_upload_size', { mb: parseInt(e.target.value) })} />
          </Field>
        </SectionCard>

        <SectionCard icon={RefreshCw} title="Sincronização Automática com SIPE">
          <Toggle checked={(configs.sipe_auto_sync_unidades as any)?.enabled === true}
            label="Sincronização automática de unidades prisionais"
            onChange={(v: boolean) => update('sipe_auto_sync_unidades', { 
              ...configs.sipe_auto_sync_unidades,
              enabled: v,
              tipo: (configs.sipe_auto_sync_unidades as any)?.tipo || 'UNIDADES_FAST',
              engine: (configs.sipe_auto_sync_unidades as any)?.engine || 'python-sdk'
            })} />
          {(configs.sipe_auto_sync_unidades as any)?.enabled === true && (
            <>
              <Field label="Modo de Agendamento">
                <Select value={(configs.sipe_auto_sync_unidades as any)?.mode || 'interval'}
                  onChange={(e: any) => update('sipe_auto_sync_unidades', {
                    ...configs.sipe_auto_sync_unidades,
                    mode: e.target.value
                  })}>
                  <option value="interval">Por Intervalo de Tempo</option>
                  <option value="fixed">Horário Diário Fixo</option>
                </Select>
              </Field>

              {((configs.sipe_auto_sync_unidades as any)?.mode || 'interval') === 'interval' ? (
                <Field label="Intervalo de Sincronização">
                  <Select value={(configs.sipe_sync_unidades_interval_hours as any)?.hours || '24'}
                    onChange={(e: any) => update('sipe_sync_unidades_interval_hours', { hours: e.target.value })}>
                    <option value="6">A cada 6 horas</option>
                    <option value="12">A cada 12 horas</option>
                    <option value="24">A cada 24 horas (diário — recomendado)</option>
                    <option value="48">A cada 48 horas</option>
                    <option value="168">A cada 7 dias (semanal)</option>
                  </Select>
                </Field>
              ) : (
                <Field label="Horário de Sincronização Diária">
                  <Select value={(configs.sipe_auto_sync_unidades as any)?.fixedHour || '02:00'}
                    onChange={(e: any) => update('sipe_auto_sync_unidades', {
                      ...configs.sipe_auto_sync_unidades,
                      fixedHour: e.target.value
                    })}>
                    {Array.from({ length: 24 }).map((_, i) => {
                      const hourStr = String(i).padStart(2, '0') + ':00'
                      return (
                        <option key={hourStr} value={hourStr}>
                          {hourStr}
                        </option>
                      )
                    })}
                  </Select>
                </Field>
              )}

              <Field label="Tipo de Scraping Automático">
                <Select value={(configs.sipe_auto_sync_unidades as any)?.tipo || 'UNIDADES_FAST'}
                  onChange={(e: any) => update('sipe_auto_sync_unidades', {
                    ...configs.sipe_auto_sync_unidades,
                    tipo: e.target.value
                  })}>
                  <option value="UNIDADES">Sincronizar Unidades (Padrão/Completo)</option>
                  <option value="UNIDADES_FAST">Sincronizar Unidades (Rápida)</option>
                  <option value="UNIDADES_INCREMENTAL_FAST">Sincronizar Unidades (Incremental Fast)</option>
                </Select>
              </Field>
              <Field label="Engine de Scraping Automático">
                <Select value={(configs.sipe_auto_sync_unidades as any)?.engine || 'python-sdk'}
                  onChange={(e: any) => update('sipe_auto_sync_unidades', {
                    ...configs.sipe_auto_sync_unidades,
                    engine: e.target.value
                  })}>
                  <option value="python-sdk">🐍 SDK Python</option>
                  <option value="firecrawl">🔥 Firecrawl</option>
                </Select>
              </Field>
            </>
          )}
        </SectionCard>

        <SectionCard icon={MapPin} title="Monitoramento & Segurança">
          <Toggle checked={configs.geolocation_enabled?.enabled !== false}
            label="Rastreamento de geolocalização de usuários"
            onChange={(v: boolean) => update('geolocation_enabled', { enabled: v })} />
          <Toggle checked={configs.chat_enabled?.enabled !== false}
            label="Chat interno habilitado"
            onChange={(v: boolean) => update('chat_enabled', { enabled: v })} />
        </SectionCard>

        <SectionCard icon={FileText} title="Marca d'Água do Dossiê">
          <Toggle checked={configs.watermark_enabled !== false}
            label="Habilitar Marca d'Água no Dossiê"
            onChange={(v: boolean) => update('watermark_enabled', v)} />
          <Field label="Posição da Marca d'Água">
            <Select value={configs.watermark_position || 'repeat'}
              onChange={(e: any) => update('watermark_position', e.target.value)}>
              <option value="repeat">Repetida (Grade na página)</option>
              <option value="center">Centralizada (Uma por página)</option>
            </Select>
          </Field>
          {(!configs.watermark_position || configs.watermark_position === 'repeat') && (
            <Field label="Espaçamento da Grade (px)">
              <Input type="number" min="150" max="800" step="50"
                value={configs.watermark_grid_spacing ?? 300}
                onChange={(e: any) => update('watermark_grid_spacing', parseInt(e.target.value) || 300)} />
            </Field>
          )}
          <Field label="Tamanho da Fonte (px)">
            <Input type="number" min="10" max="150"
              value={configs.watermark_font_size ?? 60}
              onChange={(e: any) => update('watermark_font_size', parseInt(e.target.value) || 60)} />
          </Field>
          <Field label="Cor do Texto">
            <div className="flex gap-2">
              <input type="color"
                className="w-10 h-10 p-1 border rounded-lg cursor-pointer bg-transparent border-gray-200 dark:border-gray-700"
                value={configs.watermark_color || '#cbd5e1'}
                onChange={(e: any) => update('watermark_color', e.target.value)} />
              <Input value={configs.watermark_color || '#cbd5e1'}
                onChange={(e: any) => update('watermark_color', e.target.value)}
                placeholder="#HEX" />
            </div>
          </Field>
          <Field label={`Transparência / Opacidade (${Math.round((configs.watermark_opacity ?? 0.15) * 100)}%)`}>
            <input type="range" min="0.01" max="0.5" step="0.01"
              className="w-full accent-sigma-500 bg-gray-200 dark:bg-gray-700 h-1.5 rounded-lg appearance-none cursor-pointer"
              value={configs.watermark_opacity ?? 0.15}
              onChange={(e: any) => update('watermark_opacity', parseFloat(e.target.value) || 0.15)} />
          </Field>
          <Field label="Rotação (graus)">
            <Select value={configs.watermark_rotation ?? -45}
              onChange={(e: any) => update('watermark_rotation', parseInt(e.target.value) || -45)}>
              <option value="0">Horizontal (0°)</option>
              <option value="-15">-15°</option>
              <option value="-30">-30°</option>
              <option value="-45">-45° (Padrão)</option>
              <option value="-60">-60°</option>
              <option value="-90">Vertical (-90°)</option>
              <option value="15">15°</option>
              <option value="30">30°</option>
              <option value="45">45°</option>
              <option value="60">60°</option>
              <option value="90">Vertical (90°)</option>
            </Select>
          </Field>
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
