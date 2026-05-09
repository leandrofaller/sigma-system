'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Lock, User, Shield, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';

export default function PerfilPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: 'Super Administrador',
    ADMIN: 'Administrador',
    OPERATOR: 'Operador',
  };

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Nova senha deve ter no mínimo 8 caracteres.' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/users/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Erro ao alterar senha.' });
      } else {
        setMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro de conexão. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Meu Perfil</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Gerencie suas informações e segurança</p>
      </div>

      {/* Informações do usuário */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-sigma-100 dark:bg-sigma-900/40 rounded-2xl flex items-center justify-center text-sigma-600 dark:text-sigma-400 text-2xl font-bold">
            {user.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{user.name}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1">
              <User className="w-3.5 h-3.5" />
              Grupo / Setor
            </div>
            <p className="text-gray-900 dark:text-gray-100 font-medium text-sm">
              {user.groupName || 'Sem grupo'}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1">
              <Shield className="w-3.5 h-3.5" />
              Nível de Acesso
            </div>
            <p className="text-gray-900 dark:text-gray-100 font-medium text-sm">
              {roleLabel[user.role] || user.role}
            </p>
          </div>
        </div>
      </div>

      {/* Alterar senha */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-sigma-50 dark:bg-sigma-900/30 rounded-xl flex items-center justify-center">
            <Lock className="w-5 h-5 text-sigma-600 dark:text-sigma-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Alterar Senha</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Mínimo de 8 caracteres</p>
          </div>
        </div>

        {message && (
          <div className={`flex items-center gap-2 p-3 rounded-xl mb-4 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800'
          }`}>
            {message.type === 'success'
              ? <Check className="w-4 h-4 flex-shrink-0" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {message.text}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Senha Atual
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                placeholder="Digite sua senha atual"
                className="w-full px-4 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-sigma-400 focus:bg-white dark:focus:bg-gray-700 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Nova Senha
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Mínimo 8 caracteres"
                className="w-full px-4 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-sigma-400 focus:bg-white dark:focus:bg-gray-700 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && (
              <div className="mt-1.5 flex gap-1">
                {[8, 12, 16].map((len) => (
                  <div
                    key={len}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      newPassword.length >= len
                        ? len === 8 ? 'bg-red-400' : len === 12 ? 'bg-yellow-400' : 'bg-green-400'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Confirmar Nova Senha
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repita a nova senha"
                className={`w-full px-4 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800 border rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:bg-white dark:focus:bg-gray-700 transition-all ${
                  confirmPassword && confirmPassword !== newPassword
                    ? 'border-red-300 dark:border-red-700 focus:border-red-400'
                    : 'border-gray-200 dark:border-gray-700 focus:border-sigma-400'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-xs text-red-500 mt-1">As senhas não coincidem</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || (!!confirmPassword && confirmPassword !== newPassword)}
            className="w-full py-2.5 bg-sigma-600 hover:bg-sigma-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
          >
            {loading ? 'Alterando...' : 'Alterar Senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
