'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft, Download, MapPin, Calendar as CalendarIcon,
  Gauge, CheckCircle2, Clock, AlertCircle, XCircle, Search,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Mission {
  id: string;
  title: string;
  description?: string | null;
  destination: string;
  startDate: string;
  endDate?: string | null;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  userId: string;
  user: { id: string; name: string; avatar?: string | null };
  groupId?: string | null;
  group?: { id: string; name: string; color?: string | null } | null;
  participants: string[];
  startKm?: number | null;
  endKm?: number | null;
}

interface Props {
  missions: Mission[];
  groups: { id: string; name: string; color?: string | null }[];
  users: { id: string; name: string }[];
  isAdmin: boolean;
  currentUserId: string;
}

const STATUS_LABEL: Record<Mission['status'], string> = {
  PLANNED: 'Planejada',
  IN_PROGRESS: 'Em Curso',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export function MissionReport({ missions, groups, users, isAdmin, currentUserId }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<string>('');
  const [groupId, setGroupId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return missions.filter(m => {
      if (search) {
        const s = search.toLowerCase();
        const haystack = `${m.title} ${m.destination} ${m.description ?? ''} ${m.user.name}`.toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      if (status && m.status !== status) return false;
      if (groupId && m.groupId !== groupId) return false;
      if (isAdmin && userId && m.userId !== userId) return false;
      if (from) {
        if (new Date(m.startDate) < new Date(from)) return false;
      }
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        if (new Date(m.startDate) > end) return false;
      }
      return true;
    });
  }, [missions, search, status, groupId, userId, from, to, isAdmin]);

  const stats = useMemo(() => {
    const totalKm = filtered.reduce((acc, m) => {
      if (m.startKm != null && m.endKm != null && m.endKm >= m.startKm) {
        return acc + (m.endKm - m.startKm);
      }
      return acc;
    }, 0);

    const byStatus: Record<Mission['status'], number> = {
      PLANNED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    filtered.forEach(m => { byStatus[m.status]++; });

    return {
      total: filtered.length,
      totalKm,
      byStatus,
      uniqueDestinations: new Set(filtered.map(m => m.destination.toLowerCase().trim())).size,
    };
  }, [filtered]);

  const exportCSV = () => {
    const rows = [[
      'Data Início', 'Data Fim', 'Título', 'Destino', 'Responsável', 'Grupo',
      'Status', 'KM Inicial', 'KM Final', 'KM Percorrido', 'Participantes', 'Descrição',
    ]];
    filtered.forEach(m => {
      const km = (m.startKm != null && m.endKm != null) ? (m.endKm - m.startKm) : '';
      rows.push([
        formatDateTime(m.startDate),
        m.endDate ? formatDateTime(m.endDate) : '',
        m.title,
        m.destination,
        m.user.name,
        m.group?.name ?? '',
        STATUS_LABEL[m.status],
        m.startKm?.toString() ?? '',
        m.endKm?.toString() ?? '',
        km.toString(),
        (m.participants || []).join(', '),
        (m.description ?? '').replace(/[\r\n;]+/g, ' '),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio_viagens_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const statusBadge = (s: Mission['status']) => {
    const map = {
      PLANNED:     { cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400', Icon: AlertCircle },
      IN_PROGRESS: { cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400', Icon: Clock },
      COMPLETED:   { cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400', Icon: CheckCircle2 },
      CANCELLED:   { cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400', Icon: XCircle },
    } as const;
    const { cls, Icon } = map[s];
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium ${cls}`}>
        <Icon className="w-3 h-3" /> {STATUS_LABEL[s]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <Link
        href="/missoes"
        className="inline-flex items-center gap-2 text-sm text-subtle hover:text-sigma-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar ao Calendário
      </Link>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={CalendarIcon}
          label="Total de Viagens"
          value={stats.total.toString()}
          accent="sigma"
        />
        <SummaryCard
          icon={Gauge}
          label="KM Percorridos"
          value={stats.totalKm.toLocaleString('pt-BR')}
          accent="green"
        />
        <SummaryCard
          icon={MapPin}
          label="Destinos Únicos"
          value={stats.uniqueDestinations.toString()}
          accent="orange"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Concluídas"
          value={stats.byStatus.COMPLETED.toString()}
          accent="blue"
        />
      </div>

      {/* Status breakdown */}
      <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusPill label="Planejadas" count={stats.byStatus.PLANNED} cls="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400" />
        <StatusPill label="Em Curso" count={stats.byStatus.IN_PROGRESS} cls="bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400" />
        <StatusPill label="Concluídas" count={stats.byStatus.COMPLETED} cls="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" />
        <StatusPill label="Canceladas" count={stats.byStatus.CANCELLED} cls="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" />
      </div>

      {/* Filtros */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-subtle uppercase tracking-wider ml-1">De</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full input-base px-3 py-2 mt-1 text-sm" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-subtle uppercase tracking-wider ml-1">Até</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full input-base px-3 py-2 mt-1 text-sm" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-subtle uppercase tracking-wider ml-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full input-base px-3 py-2 mt-1 text-sm">
              <option value="">Todos</option>
              <option value="PLANNED">Planejada</option>
              <option value="IN_PROGRESS">Em Curso</option>
              <option value="COMPLETED">Concluída</option>
              <option value="CANCELLED">Cancelada</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-subtle uppercase tracking-wider ml-1">Grupo</label>
            <select value={groupId} onChange={e => setGroupId(e.target.value)}
              className="w-full input-base px-3 py-2 mt-1 text-sm">
              <option value="">Todos</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div className="lg:col-span-2">
              <label className="text-[10px] font-bold text-subtle uppercase tracking-wider ml-1">Usuário</label>
              <select value={userId} onChange={e => setUserId(e.target.value)}
                className="w-full input-base px-3 py-2 mt-1 text-sm">
                <option value="">Todos os usuários</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.id === currentUserId ? ' (você)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={isAdmin ? 'lg:col-span-2' : 'lg:col-span-4'}>
            <label className="text-[10px] font-bold text-subtle uppercase tracking-wider ml-1">Buscar</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Título, destino, responsável..."
                className="w-full pl-9 pr-3 py-2 input-base text-sm" />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button onClick={exportCSV}
            className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-sigma-600/20 transition-all active:scale-95">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
                <th className="text-left text-xs font-semibold text-subtle px-4 py-3">Data</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-3">Título</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-3">Destino</th>
                {isAdmin && <th className="text-left text-xs font-semibold text-subtle px-4 py-3">Responsável</th>}
                <th className="text-left text-xs font-semibold text-subtle px-4 py-3">Grupo</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-subtle px-4 py-3">KM</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-3">Participantes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-sm text-subtle">
                    Nenhuma viagem encontrada com os filtros aplicados.
                  </td>
                </tr>
              )}
              {filtered.map(m => {
                const km = (m.startKm != null && m.endKm != null && m.endKm >= m.startKm)
                  ? m.endKm - m.startKm : null;
                return (
                  <tr key={m.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-subtle font-mono whitespace-nowrap">
                      {format(new Date(m.startDate), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3 text-sm text-title font-medium">{m.title}</td>
                    <td className="px-4 py-3 text-sm text-body">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-sigma-500" /> {m.destination}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-sm text-body">{m.user.name}</td>
                    )}
                    <td className="px-4 py-3 text-xs text-body">
                      {m.group ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: m.group.color ?? '#6172f3' }} />
                          {m.group.name}
                        </span>
                      ) : <span className="text-subtle">—</span>}
                    </td>
                    <td className="px-4 py-3">{statusBadge(m.status)}</td>
                    <td className="px-4 py-3 text-xs text-right font-mono whitespace-nowrap">
                      {km != null ? (
                        <span className="font-bold text-sigma-600 dark:text-sigma-400">{km.toLocaleString('pt-BR')} km</span>
                      ) : (
                        <span className="text-subtle">
                          {m.startKm != null ? `${m.startKm} → ?` : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-subtle max-w-[200px] truncate">
                      {m.participants?.length ? m.participants.join(', ') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon, label, value, accent,
}: { icon: any; label: string; value: string; accent: 'sigma' | 'green' | 'orange' | 'blue' }) {
  const accents = {
    sigma: 'bg-sigma-50 dark:bg-sigma-900/20 text-sigma-600 dark:text-sigma-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${accents[accent]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-[10px] font-bold text-subtle uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-title leading-tight">{value}</p>
      </div>
    </div>
  );
}

function StatusPill({ label, count, cls }: { label: string; count: number; cls: string }) {
  return (
    <div className={`flex items-center justify-between px-4 py-2 rounded-xl ${cls}`}>
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-lg font-bold">{count}</span>
    </div>
  );
}
