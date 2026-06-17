'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Lock, User, Shield, Eye, EyeOff, Check, AlertCircle, ScanFace, Trash2, Camera } from 'lucide-react';
import { FaceLoginCamera } from '@/components/FaceLoginCamera';

export default function PerfilPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  // ── Alterar senha ──────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Reconhecimento facial ──────────────────────────────────────────────────
  const [faceStatus, setFaceStatus] = useState<{ hasFace: boolean; registeredAt: string | null } | null>(null);
  const [faceStatusLoading, setFaceStatusLoading] = useState(true);
  const [showFaceCamera, setShowFaceCamera] = useState(false);
  const [faceMsg, setFaceMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [faceRegLoading, setFaceRegLoading] = useState(false);

  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: 'Super Administrador',
    ADMIN: 'Administrador',
    OPERATOR: 'Operador',
  };

  // Carrega status facial ao montar
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/users/${user.id}/face`)
      .then((r) => r.json())
      .then((d) => setFaceStatus(d))
      .catch(() => setFaceStatus({ hasFace: false, registeredAt: null }))
      .finally(() => setFaceStatusLoading(false));
  }, [user?.id]);

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

  async function handleFaceDescriptor(descriptor: number[]) {
    setFaceRegLoading(true);
    setFaceMsg(null);
    try {
      const res = await fetch(`/api/users/${user.id}/face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faceDescriptor: descriptor }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFaceMsg({ type: 'error', text: data.error || 'Erro ao cadastrar face.' });
      } else {
        setFaceMsg({ type: 'success', text: 'Rosto cadastrado com sucesso! Você já pode usar o login facial.' });
        setFaceStatus({ hasFace: true, registeredAt: new Date().toISOString() });
        setShowFaceCamera(false);
      }
    } catch {
      setFaceMsg({ type: 'error', text: 'Erro de conexão. Tente novamente.' });
    } finally {
      setFaceRegLoading(false);
    }
  }

  async function handleRemoveFace() {
    if (!confirm('Remover o cadastro facial? Você não poderá mais usar login pelo rosto.')) return;
    setFaceRegLoading(true);
    setFaceMsg(null);
    try {
      const res = await fetch(`/api/users/${user.id}/face`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setFaceMsg({ type: 'error', text: data.error || 'Erro ao remover cadastro.' });
      } else {
        setFaceMsg({ type: 'success', text: 'Cadastro facial removido.' });
        setFaceStatus({ hasFace: false, registeredAt: null });
        setShowFaceCamera(false);
      }
    } catch {
      setFaceMsg({ type: 'error', text: 'Erro de conexão. Tente novamente.' });
    } finally {
      setFaceRegLoading(false);
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

      {/* Reconhecimento Facial */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <ScanFace className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Login por Reconhecimento Facial</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Entre no sistema apenas com seu rosto</p>
            </div>
          </div>

          {/* Badge de status */}
          {!faceStatusLoading && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              faceStatus?.hasFace
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>
              {faceStatus?.hasFace ? '✓ Cadastrado' : 'Não cadastrado'}
            </span>
          )}
        </div>

        {faceStatusLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Verificando status...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Info de status */}
            {faceStatus?.hasFace && faceStatus.registeredAt && (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                <Check className="w-3.5 h-3.5 text-green-500" />
                Cadastrado em {new Date(faceStatus.registeredAt).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </div>
            )}

            {/* Feedback */}
            {faceMsg && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                faceMsg.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800'
              }`}>
                {faceMsg.type === 'success'
                  ? <Check className="w-4 h-4 flex-shrink-0" />
                  : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                {faceMsg.text}
              </div>
            )}

            {/* Câmera de cadastro */}
            {showFaceCamera && !faceRegLoading && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Posicione seu rosto na câmera. O sistema vai capturar automaticamente.
                </p>
                <FaceLoginCamera active={showFaceCamera && !faceRegLoading} onDescriptor={handleFaceDescriptor} />
                <button
                  type="button"
                  onClick={() => setShowFaceCamera(false)}
                  className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}

            {faceRegLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Salvando cadastro facial...
              </div>
            )}

            {/* Ações */}
            {!showFaceCamera && !faceRegLoading && (
              <div className="flex gap-3">
                <button
                  id="btn-cadastrar-face"
                  type="button"
                  onClick={() => { setShowFaceCamera(true); setFaceMsg(null); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  {faceStatus?.hasFace ? 'Atualizar rosto' : 'Cadastrar meu rosto'}
                </button>

                {faceStatus?.hasFace && (
                  <button
                    id="btn-remover-face"
                    type="button"
                    onClick={handleRemoveFace}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium transition-colors border border-red-200 dark:border-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remover
                  </button>
                )}
              </div>
            )}
          </div>
        )}
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
