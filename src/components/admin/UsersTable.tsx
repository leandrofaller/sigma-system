'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, Shield, User, X, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { formatDate, getRoleName } from '@/lib/utils';

interface Props {
  users: any[];
  groups: any[];
  currentUserRole: string;
}

export function UsersTable({ users: initialUsers, groups, currentUserRole }: Props) {
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
      const body = editingUser ? { ...form } : { ...form };
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
    SUPER_ADMIN: 'bg-purple-50 text-purple-700 border-purple-200',
    ADMIN: 'bg-blue-50 text-blue-700 border-blue-200',
    OPERATOR: 'bg-gray-50 text-gray-600 border-gray-200',
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setEditingUser(null); setForm({ name: '', email: '', phone: '', password: '', role: 'OPERATOR', groupId: '' }); setShowForm(true); }}
          className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'name', label: 'Nome *', type: 'text', placeholder: 'Nome completo' },
              { key: 'email', label: 'E-mail *', type: 'email', placeholder: 'email@domain.com' },
              { key: 'phone', label: 'Telefone', type: 'text', placeholder: '(69) 9 0000-0000' },
              { key: 'password', label: editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha *', type: 'password', placeholder: '••••••••' },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
                <input type={type} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sigma-400" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Função</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sigma-400">
                <option value="OPERATOR">Operador</option>
                <option value="ADMIN">Administrador</option>
                {currentUserRole === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Administrador</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Grupo</label>
              <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sigma-400">
                <option value="">Sem grupo</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancelar</button>
            <button onClick={handleSubmit} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-sigma-600 hover:bg-sigma-700 text-white rounded-xl transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {editingUser ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </motion.div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50 bg-gray-50/50">
              <th className="text-left text-xs font-semibold text-gray-500 px-6 py-4">Usuário</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Função</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Grupo</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Status</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-4">Último Acesso</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-6 py-4">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-sigma-100 rounded-xl flex items-center justify-center text-sigma-600 text-sm font-bold">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${roleColors[user.role]}`}>
                    {getRoleName(user.role)}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">{user.group?.name || '-'}</td>
                <td className="px-4 py-4">
                  <button onClick={() => handleToggleActive(user)}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors
                      ${user.isActive ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}>
                    {user.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {user.isActive ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="px-4 py-4 text-xs text-gray-400">
                  {user.lastLogin ? formatDate(user.lastLogin) : 'Nunca'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(user)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
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
