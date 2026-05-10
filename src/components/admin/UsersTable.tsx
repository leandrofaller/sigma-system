'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pencil, X, Loader2, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { formatDate, getRoleName } from '@/lib/utils';

interface Props {
  users: any[];
  groups: any[];
  currentUserRole: string;
  currentUserId: string;
}

export function UsersTable({ users: initialUsers, groups, currentUserRole, currentUserId }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'OPERATOR', groupId: '' });

  const openEdit = (user: any) => {
    setEditingUser(user);
    setForm({ name: user.name, email: user.email, phone: user.phone || '', password: '', role: user.role, groupId: user.groupId || '' });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.email) return;
    setLoading(true);
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';
      const body = { ...form };
      if (editingUser && !form.password) delete (body as any).password;

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();

      if (editingUser) {
        setUsers((prev) => prev.map((u) => u.id === editingUser.id ? { ...u, ...data } : u));
      } else {
        setUsers((prev) => [data, ...prev]);
      }
      setShowForm(false);
      setEditingUser(null);
      setForm({ name: '', email: '', phone: '', password: '', role: 'OPERATOR', groupId: '' });
    } catch {
      alert('Erro ao salvar usuário.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (!confirm(`Excluir "${user.name}"? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } else {
      alert('Erro ao excluir usuário.');
    }
  };

  const handleToggleActive = async (user: any) => {
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...user, isActive: !user.isActive }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, isActive: !u.isActive } : u));
    }
  };

  const roleColors: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    ADMIN:       'bg-blue-50   dark:bg-blue-900/20   text-blue-700   dark:text-blue-400   border-blue-200   dark:border-blue-800',
    OPERATOR:    'bg-gray-50   dark:bg-gray-800      text-gray-600   dark:text-gray-400   border-gray-200   dark:border-gray-700',
  };

  const inputCls = 'w-full input-base px-3 py-2';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setEditingUser(null); setForm({ name: '', email: '', phone: '', password: '', role: 'OPERATOR', groupId: '' }); setShowForm(true); }}
          className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-title">{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h3>
            <button onClick={() => setShowForm(false)} className="text-subtle hover:text-body"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'name',     label: 'Nome *',                                                    type: 'text',     placeholder: 'Nome completo'    },
              { key: 'email',    label: 'E-mail *',                                                  type: 'email',    placeholder: 'email@domain.com' },
              { key: 'phone',    label: 'Telefone',                                                  type: 'text',     placeholder: '(69) 9 0000-0000' },
              { key: 'password', label: editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha *', type: 'password', placeholder: '••••••••' },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-subtle mb-1.5">{label}</label>
                <input type={type} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder} className={inputCls} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Função</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
                <option value="OPERATOR">Operador</option>
                <option value="ADMIN">Administrador</option>
                {currentUserRole === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Administrador</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Grupo</label>
              <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} className={inputCls}>
                <option value="">Sem grupo</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-sigma-600 hover:bg-sigma-700 text-white rounded-xl transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {editingUser ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </motion.div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
              <th className="text-left text-xs font-semibold text-subtle px-6 py-4">Usuário</th>
              <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Função</th>
              <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Grupo</th>
              <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Status</th>
              <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Último Acesso</th>
              <th className="text-right text-xs font-semibold text-subtle px-6 py-4">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 icon-badge-sigma rounded-xl flex items-center justify-center text-sm font-bold">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-title">{user.name}</p>
                      <p className="text-xs text-subtle">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${roleColors[user.role]}`}>
                    {getRoleName(user.role)}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-body">{user.group?.name || '-'}</td>
                <td className="px-4 py-4">
                  <button onClick={() => handleToggleActive(user)}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors
                      ${user.isActive
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30'
                        : 'bg-red-50   dark:bg-red-900/20   text-red-700   dark:text-red-400   border-red-200   dark:border-red-800   hover:bg-red-100   dark:hover:bg-red-900/30'}`}>
                    {user.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {user.isActive ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="px-4 py-4 text-xs text-subtle">
                  {user.lastLogin ? formatDate(user.lastLogin) : 'Nunca'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(user)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {currentUserRole === 'SUPER_ADMIN' && user.id !== currentUserId && (
                      <button onClick={() => handleDeleteUser(user)}
                        className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Excluir usuário">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
