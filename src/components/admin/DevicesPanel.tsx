'use client';

import { useState } from 'react';
import { Monitor, Check, Trash2, Shield, ShieldOff, Loader2, RefreshCw, ToggleLeft, ToggleRight, MapPin, MapPinOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeviceUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Device {
  id: string;
  name: string;
  userAgent: string;
  ipAddress: string;
  status: 'PENDING' | 'AUTHORIZED' | 'REVOKED';
  authorizedAt: string | null;
  lastUsedAt: string;
  createdAt: string;
  latitude: number | null;
  longitude: number | null;
  locationAddress: string | null;
  locationAt: string | null;
  user: DeviceUser;
}

type Tab = 'PENDING' | 'AUTHORIZED' | 'REVOKED';

interface Props {
  initialDevices: Device[];
  enforcementEnabled: boolean;
  isSuperAdmin: boolean;
}

export function DevicesPanel({ initialDevices, enforcementEnabled: initialEnforcement, isSuperAdmin }: Props) {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [activeTab, setActiveTab] = useState<Tab>('PENDING');
  const [loading, setLoading] = useState<string | null>(null);
  const [enforcement, setEnforcement] = useState(initialEnforcement);
  const [togglingEnforcement, setTogglingEnforcement] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'PENDING', label: 'Pendentes' },
    { key: 'AUTHORIZED', label: 'Autorizados' },
    { key: 'REVOKED', label: 'Revogados' },
  ];

  const filtered = devices.filter((d) => d.status === activeTab);
  const pendingCount = devices.filter((d) => d.status === 'PENDING').length;

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices);
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function updateStatus(id: string, status: 'AUTHORIZED' | 'REVOKED') {
    setLoading(id + status);
    try {
      const res = await fetch('/api/admin/devices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setDevices((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status } : d))
        );
      }
    } finally {
      setLoading(null);
    }
  }

  async function removeDevice(id: string) {
    if (!confirm('Remover este dispositivo? O usuário poderá registrá-lo novamente no próximo login.')) return;
    setLoading(id + 'delete');
    try {
      const res = await fetch(`/api/admin/devices?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== id));
      }
    } finally {
      setLoading(null);
    }
  }

  async function toggleEnforcement() {
    if (!isSuperAdmin) return;
    setTogglingEnforcement(true);
    const newValue = !enforcement;
    try {
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_auth_enabled: newValue }),
      });
      setEnforcement(newValue);
    } finally {
      setTogglingEnforcement(false);
    }
  }

  function fmt(dateStr: string) {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function roleLabel(role: string) {
    const map: Record<string, string> = {
      SUPER_ADMIN: 'Super Admin',
      ADMIN: 'Admin',
      USER: 'Usuário',
    };
    return map[role] ?? role;
  }

  return (
    <div className="space-y-4">
      {/* Enforcement toggle */}
      {isSuperAdmin && (
        <div className="card p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-title flex items-center gap-2">
              <Shield className="w-4 h-4 text-sigma-400" />
              Controle de dispositivos ativo
            </p>
            <p className="text-xs text-body mt-0.5">
              {enforcement
                ? 'Novos dispositivos ficam bloqueados até aprovação manual.'
                : 'Novos dispositivos são autorizados automaticamente.'}
            </p>
          </div>
          <button
            onClick={toggleEnforcement}
            disabled={togglingEnforcement}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              enforcement
                ? 'bg-sigma-500/20 text-sigma-400 border border-sigma-500/30 hover:bg-sigma-500/30'
                : 'bg-gray-700 text-gray-400 border border-gray-600 hover:bg-gray-600'
            )}
          >
            {togglingEnforcement ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : enforcement ? (
              <ToggleRight className="w-4 h-4" />
            ) : (
              <ToggleLeft className="w-4 h-4" />
            )}
            {enforcement ? 'Ativo' : 'Inativo'}
          </button>
        </div>
      )}

      {/* Tabs + refresh */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex rounded-xl overflow-hidden border border-gray-700">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors relative',
                activeTab === tab.key
                  ? 'bg-sigma-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              )}
            >
              {tab.label}
              {tab.key === 'PENDING' && pendingCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Monitor className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Nenhum dispositivo {activeTab === 'PENDING' ? 'pendente' : activeTab === 'AUTHORIZED' ? 'autorizado' : 'revogado'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuário</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Dispositivo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">IP</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Último acesso</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Registrado em</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Localização</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filtered.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-title font-medium truncate max-w-[160px]">{device.user.name}</p>
                      <p className="text-gray-500 text-xs truncate max-w-[160px]">{device.user.email}</p>
                      <p className="text-gray-600 text-xs">{roleLabel(device.user.role)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-title truncate max-w-[200px]">{device.name}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="font-mono text-gray-400 text-xs">{device.ipAddress || '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-gray-400 text-xs">{fmt(device.lastUsedAt)}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-gray-400 text-xs">{fmt(device.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {device.locationAddress ? (
                        <a
                          href={`https://www.google.com/maps?q=${device.latitude},${device.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-1.5 group max-w-[220px]"
                          title={device.locationAddress}
                        >
                          <MapPin className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-300 text-xs leading-relaxed line-clamp-2 group-hover:text-white transition-colors">
                            {device.locationAddress}
                          </span>
                        </a>
                      ) : device.latitude !== null && device.longitude !== null ? (
                        <a
                          href={`https://www.google.com/maps?q=${device.latitude},${device.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 group"
                        >
                          <MapPin className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                          <span className="font-mono text-gray-400 text-xs group-hover:text-white transition-colors">
                            {device.latitude.toFixed(4)}, {device.longitude.toFixed(4)}
                          </span>
                        </a>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <MapPinOff className={cn(
                            'w-3.5 h-3.5 flex-shrink-0',
                            device.status === 'PENDING' ? 'text-yellow-500' : 'text-gray-600'
                          )} />
                          <span className={cn(
                            'text-xs',
                            device.status === 'PENDING' ? 'text-yellow-600' : 'text-gray-600'
                          )}>
                            Não informado
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        {device.status !== 'AUTHORIZED' && (
                          <button
                            onClick={() => updateStatus(device.id, 'AUTHORIZED')}
                            disabled={loading === device.id + 'AUTHORIZED'}
                            title="Autorizar"
                            className="p-1.5 rounded-lg text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-50"
                          >
                            {loading === device.id + 'AUTHORIZED' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {device.status !== 'REVOKED' && (
                          <button
                            onClick={() => updateStatus(device.id, 'REVOKED')}
                            disabled={loading === device.id + 'REVOKED'}
                            title="Revogar"
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                          >
                            {loading === device.id + 'REVOKED' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ShieldOff className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => removeDevice(device.id)}
                          disabled={loading === device.id + 'delete'}
                          title="Remover"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                        >
                          {loading === device.id + 'delete' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
