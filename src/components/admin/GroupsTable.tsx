'use client';

import { useState } from 'react';
import { Plus, X, Loader2, Users, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
  groups: any[];
}

const COLORS = ['#6172f3', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#0ea5e9', '#f59e0b'];

export function GroupsTable({ groups: initialGroups }: Props) {
  const [groups, setGroups] = useState(initialGroups);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: COLORS[0] });

  const handleCreate = async () => {
    if (!form.name) return;
    setLoading(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setGroups((prev) => [...prev, { ...data, _count: { users: 0, relints: 0 } }]);
      setShowForm(false);
      setForm({ name: '', description: '', color: COLORS[0] });
    } catch {
      alert('Erro ao criar grupo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Novo Grupo
        </button>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-title">Novo Grupo / Setor</h3>
            <button onClick={() => setShowForm(false)} className="text-subtle hover:text-body"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Nome *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
                placeholder="Ex: NÚCLEO DE INTELIGÊNCIA"
                className="w-full input-base px-3 py-2 uppercase" />
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Descrição</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full input-base px-3 py-2" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-subtle mb-2">Cor do Grupo</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-600 scale-110' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-sigma-600 hover:bg-sigma-700 text-white rounded-xl disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar
            </button>
          </div>
        </motion.div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group, i) => (
          <motion.div key={group.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="card p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: (group.color || '#6172f3') + '20' }}>
                <div className="w-3 h-3 rounded-full" style={{ background: group.color || '#6172f3' }} />
              </div>
              <div>
                <p className="font-semibold text-title text-sm">{group.name}</p>
                {group.description && <p className="text-xs text-subtle mt-0.5">{group.description}</p>}
              </div>
            </div>
            <div className="flex gap-4 text-sm text-body">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> {group._count?.users || 0} usuários
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> {group._count?.relints || 0} RELINTs
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
