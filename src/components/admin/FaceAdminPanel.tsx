'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanFace, Search, RefreshCw, Trash2, Check, X,
  ChevronDown, ShieldCheck, ShieldOff, Clock, Users
} from 'lucide-react';
import { formatDate, getRoleName } from '@/lib/utils';

interface FaceUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  hasFace: boolean;
  faceRegisteredAt: string | null;
  lastLogin: string | null;
  group: { id: string; name: string } | null;
}

type FilterStatus = 'all' | 'with_face' | 'without_face';

const roleColors: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  ADMIN:       'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  OPERATOR:    'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

export function FaceAdminPanel() {
  const [users, setUsers] = useState<FaceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [toast, setToast] = useState<{ id: number; type: 'success' | 'error'; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<FaceUser | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now();
    setToast({ id, type, text });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 4000);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/face-auth');
      if (!res.ok) throw new Error('Erro ao carregar usuários');
      const data = await res.json();
      setUsers(data);
    } catch {
      showToast('error', 'Não foi possível carregar os usuários.');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleRemoveFace = async (user: FaceUser) => {
    setConfirmRemove(null);
    setActionLoading(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}/face`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao remover face');
      setUsers((prev) => prev.map((u) =>
        u.id === user.id ? { ...u, hasFace: false, faceRegisteredAt: null } : u
      ));
      showToast('success', `Cadastro facial de "${user.name}" removido com sucesso.`);
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao remover cadastro facial.');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtragem e busca
  const filtered = users.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.group?.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ||
      (filter === 'with_face' && u.hasFace) ||
      (filter === 'without_face' && !u.hasFace);
    return matchSearch && matchFilter;
  });

  const stats = {
    total: users.length,
    withFace: users.filter((u) => u.hasFace).length,
    active: users.filter((u) => u.isActive).length,
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium border ${
              toast.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700'
                : 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700'
            }`}
          >
            {toast.type === 'success'
              ? <Check className="w-4 h-4 flex-shrink-0" />
              : <X className="w-4 h-4 flex-shrink-0" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de confirmação de remoção */}
      <AnimatePresence>
        {confirmRemove && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setConfirmRemove(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-title text-sm">Remover cadastro facial</h3>
                  <p className="text-xs text-subtle">Esta ação não pode ser desfeita</p>
                </div>
              </div>
              <p className="text-sm text-body mb-5">
                Tem certeza que deseja remover o cadastro facial de{' '}
                <span className="font-semibold text-title">{confirmRemove.name}</span>?{' '}
                O usuário não poderá mais usar o login por reconhecimento facial até que cadastre novamente.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmRemove(null)}
                  className="flex-1 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleRemoveFace(confirmRemove)}
                  className="flex-1 py-2.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Remover
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            icon: <Users className="w-5 h-5" />,
            label: 'Total de Usuários',
            value: stats.total,
            color: 'text-gray-600 dark:text-gray-400',
            bg: 'bg-gray-50 dark:bg-gray-800/60',
          },
          {
            icon: <ShieldCheck className="w-5 h-5" />,
            label: 'Com face cadastrada',
            value: stats.withFace,
            color: 'text-green-600 dark:text-green-400',
            bg: 'bg-green-50 dark:bg-green-900/20',
          },
          {
            icon: <ShieldOff className="w-5 h-5" />,
            label: 'Sem face cadastrada',
            value: stats.total - stats.withFace,
            color: 'text-orange-600 dark:text-orange-400',
            bg: 'bg-orange-50 dark:bg-orange-900/20',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bg} rounded-2xl p-4 border border-transparent`}
          >
            <div className={`${stat.color} mb-2`}>{stat.icon}</div>
            <p className="text-2xl font-bold text-title">{stat.value}</p>
            <p className="text-xs text-subtle mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Barra de controles */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou grupo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 input-base text-sm"
          />
        </div>

        {/* Filtro de status facial */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0">
          {([
            { key: 'all', label: 'Todos' },
            { key: 'with_face', label: 'Com face' },
            { key: 'without_face', label: 'Sem face' },
          ] as { key: FilterStatus; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                filter === key
                  ? 'bg-sigma-600 text-white'
                  : 'text-subtle hover:text-body hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={loadUsers}
          disabled={loading}
          title="Recarregar"
          className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-subtle hover:text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-subtle">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando usuários...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-subtle">
            <ScanFace className="w-10 h-10 opacity-30" />
            <p className="text-sm">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
                <th className="text-left text-xs font-semibold text-subtle px-6 py-4">Usuário</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Função</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Grupo</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">
                  <div className="flex items-center gap-1.5">
                    <ScanFace className="w-3.5 h-3.5" />
                    Face Cadastrada
                  </div>
                </th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Último Login</th>
                <th className="text-right text-xs font-semibold text-subtle px-6 py-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              <AnimatePresence initial={false}>
                {filtered.map((user) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    {/* Nome + e-mail */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 icon-badge-sigma rounded-xl flex items-center justify-center text-sm font-bold shrink-0">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-title leading-tight">{user.name}</p>
                          <p className="text-xs text-subtle">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Função */}
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${roleColors[user.role]}`}>
                        {getRoleName(user.role)}
                      </span>
                    </td>

                    {/* Grupo */}
                    <td className="px-4 py-4 text-sm text-body">{user.group?.name || '-'}</td>

                    {/* Status facial */}
                    <td className="px-4 py-4">
                      {user.hasFace ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded-full">
                              <Check className="w-3 h-3" />
                              Cadastrada
                            </span>
                          </div>
                          {user.faceRegisteredAt && (
                            <p className="text-xs text-subtle flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(user.faceRegisteredAt)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">
                          <X className="w-3 h-3" />
                          Não cadastrada
                        </span>
                      )}
                    </td>

                    {/* Último login */}
                    <td className="px-4 py-4 text-xs text-subtle">
                      {user.lastLogin ? formatDate(user.lastLogin) : 'Nunca'}
                    </td>

                    {/* Ações */}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {user.hasFace ? (
                          <button
                            onClick={() => setConfirmRemove(user)}
                            disabled={actionLoading === user.id}
                            title="Remover cadastro facial"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {actionLoading === user.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            Remover face
                          </button>
                        ) : (
                          <span className="text-xs text-subtle italic px-3 py-1.5">
                            Sem cadastro
                          </span>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Rodapé informativo */}
      <p className="text-xs text-subtle text-center">
        {filtered.length} de {users.length} usuário{users.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''}
        {' · '}O administrador pode remover o cadastro facial de qualquer usuário.
        Para cadastrar, o próprio usuário deve acessar seu perfil.
      </p>
    </div>
  );
}
