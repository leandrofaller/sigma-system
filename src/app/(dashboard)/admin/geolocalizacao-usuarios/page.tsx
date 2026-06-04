'use client';

import { useEffect, useState } from 'react';
import { MapPin, CheckCircle2, XCircle, Clock, Loader2, AlertCircle } from 'lucide-react';

interface GeoUser {
  id: string;
  name: string;
  email: string;
  geoStatus: 'pending' | 'authorized' | 'denied' | 'admin-approved';
  geoLocationData: any;
  geoDeniedAt: string | null;
  geoApprovedBy: string | null;
  geoApprovedAt: string | null;
  createdAt: string;
  approverName?: string;
}

type StatusFilter = 'pending' | 'denied' | 'authorized' | 'admin-approved';

export default function GeolocationAdminPage() {
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [users, setUsers] = useState<GeoUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, [status]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/geolocation/pending?status=${status}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      } else {
        console.error('Erro ao buscar usuários:', res.statusText);
      }
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
    } finally {
      setLoading(false);
    }
  };

  const approveUser = async (userId: string) => {
    setActionLoading(userId);
    try {
      const res = await fetch('/api/admin/geolocation/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        alert('Usuário aprovado com sucesso');
        fetchUsers();
      } else {
        alert('Erro ao aprovar usuário');
      }
    } catch (err) {
      alert('Erro ao aprovar usuário');
    } finally {
      setActionLoading(null);
    }
  };

  const forceAccess = async (userId: string) => {
    if (!confirm('Você tem certeza que quer forçar o acesso para este usuário?')) {
      return;
    }

    setActionLoading(userId);
    try {
      const res = await fetch('/api/admin/geolocation/force-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        alert('Acesso forcefully aprovado');
        fetchUsers();
      } else {
        alert('Erro ao forçar acesso');
      }
    } catch (err) {
      alert('Erro ao forçar acesso');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (geoStatus: string) => {
    const config: Record<string, { icon: any; color: string; label: string }> = {
      pending: {
        icon: Clock,
        color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
        label: 'Pendente',
      },
      authorized: {
        icon: CheckCircle2,
        color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
        label: 'Autorizado',
      },
      denied: {
        icon: XCircle,
        color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
        label: 'Negado',
      },
      'admin-approved': {
        icon: CheckCircle2,
        color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
        label: 'Aprovado por Admin',
      },
    };

    const cfg = config[geoStatus] || config.pending;
    const Icon = cfg.icon;

    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
        <Icon className="w-3.5 h-3.5" />
        {cfg.label}
      </div>
    );
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-title">Geolocalização de Usuários</h1>
        <p className="text-sm text-subtle mt-1">
          Gerenciar permissões de geolocalização e aprovar acessos
        </p>
      </div>

      {/* Filtros */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          {(['pending', 'denied', 'authorized', 'admin-approved'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                status === s
                  ? 'bg-sigma-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {s === 'pending' && 'Pendentes'}
              {s === 'denied' && 'Negados'}
              {s === 'authorized' && 'Autorizados'}
              {s === 'admin-approved' && 'Aprovados por Admin'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Usuários */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-sigma-500" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-subtle">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum usuário neste status</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((user) => (
              <div key={user.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div>
                        <p className="font-semibold text-title">{user.name}</p>
                        <p className="text-sm text-subtle">{user.email}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
                      <div>
                        <p className="text-subtle mb-1">Status</p>
                        {getStatusBadge(user.geoStatus)}
                      </div>

                      {user.geoLocationData && (
                        <>
                          <div>
                            <p className="text-subtle mb-1">Endereço</p>
                            <p className="font-mono text-gray-700 dark:text-gray-300">
                              {user.geoLocationData.address || 'Sem endereço'}
                            </p>
                          </div>
                          <div>
                            <p className="text-subtle mb-1">Precisão</p>
                            <p className="font-mono text-gray-700 dark:text-gray-300">
                              ±{Math.round(user.geoLocationData.accuracy || 0)}m
                            </p>
                          </div>
                        </>
                      )}

                      <div>
                        <p className="text-subtle mb-1">
                          {user.geoStatus === 'denied' ? 'Negado em' : 'Data'}
                        </p>
                        <p className="text-gray-700 dark:text-gray-300">
                          {user.geoDeniedAt
                            ? formatDate(user.geoDeniedAt)
                            : formatDate(user.createdAt)}
                        </p>
                      </div>

                      {user.geoApprovedAt && (
                        <div>
                          <p className="text-subtle mb-1">Aprovado por</p>
                          <p className="text-gray-700 dark:text-gray-300">
                            {user.approverName || 'Admin'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  {user.geoStatus === 'denied' && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => approveUser(user.id)}
                        disabled={actionLoading === user.id}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        {actionLoading === user.id ? (
                          <Loader2 className="w-3 h-3 animate-spin inline-block" />
                        ) : (
                          'Aprovar'
                        )}
                      </button>
                      <button
                        onClick={() => forceAccess(user.id)}
                        disabled={actionLoading === user.id}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        {actionLoading === user.id ? (
                          <Loader2 className="w-3 h-3 animate-spin inline-block" />
                        ) : (
                          'Forçar Acesso'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <p className="font-semibold mb-1">Como funciona:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li><strong>Pendentes</strong>: Usuários que ainda não completaram a solicitação</li>
            <li><strong>Negados</strong>: Usuários que recusaram a permissão (ação requerida)</li>
            <li><strong>Autorizados</strong>: Usuários com geo capturada com sucesso</li>
            <li><strong>Aprovados</strong>: Usuários aprovados manualmente por admin</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
