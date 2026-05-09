'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showRequest, setShowRequest] = useState(false);
  const [reqName, setReqName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqMessage, setReqMessage] = useState('');
  const [reqLoading, setReqLoading] = useState(false);
  const [reqSuccess, setReqSuccess] = useState('');
  const [reqError, setReqError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError('Credenciais inválidas. Verifique e tente novamente.');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      setError('Erro ao conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqLoading(true);
    setReqError('');
    setReqSuccess('');
    try {
      const res = await fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: reqName, email: reqEmail, message: reqMessage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReqError(data.error || 'Erro ao enviar solicitação.');
      } else {
        setReqSuccess('Solicitação enviada! Um administrador irá analisá-la em breve.');
        setReqName('');
        setReqEmail('');
        setReqMessage('');
      }
    } catch {
      setReqError('Erro ao conectar ao servidor.');
    } finally {
      setReqLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
      <div className="w-full max-w-md animate-fade-in">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)' }}>
            <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Portal do Cliente</h1>
          <p className="text-gray-400 text-sm mt-1">LogiTrack Express — Acesso Restrito</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl mb-4 overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => setShowRequest(false)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              !showRequest ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Entrar
          </button>
          <button
            onClick={() => setShowRequest(true)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              showRequest ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Solicitar Acesso
          </button>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-2xl p-8">

          {!showRequest ? (
            /* Login Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">E-mail</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com" required autoComplete="email"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                    className="w-full rounded-xl px-4 py-3 pl-10 focus:outline-none text-sm placeholder:text-gray-500 transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Senha</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <input type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    required autoComplete="current-password"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                    className="w-full rounded-xl px-4 py-3 pl-10 pr-12 focus:outline-none text-sm placeholder:text-gray-500 transition-all" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-red-400"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Autenticando...
                  </span>
                ) : 'Entrar'}
              </button>
            </form>
          ) : (
            /* Access Request Form */
            <form onSubmit={handleRequest} className="space-y-5">
              <div>
                <p className="text-sm text-gray-400 mb-4">
                  Preencha o formulário abaixo. Seu pedido será analisado por um administrador.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Nome completo</label>
                <input type="text" value={reqName} onChange={(e) => setReqName(e.target.value)}
                  placeholder="Seu nome" required
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                  className="w-full rounded-xl px-4 py-3 focus:outline-none text-sm placeholder:text-gray-500 transition-all" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">E-mail</label>
                <input type="email" value={reqEmail} onChange={(e) => setReqEmail(e.target.value)}
                  placeholder="seu@email.com" required
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                  className="w-full rounded-xl px-4 py-3 focus:outline-none text-sm placeholder:text-gray-500 transition-all" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Justificativa <span className="text-gray-600">(opcional)</span></label>
                <textarea value={reqMessage} onChange={(e) => setReqMessage(e.target.value)}
                  placeholder="Descreva o motivo da solicitação..." rows={3}
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', resize: 'none' }}
                  className="w-full rounded-xl px-4 py-3 focus:outline-none text-sm placeholder:text-gray-500 transition-all" />
              </div>

              {reqError && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-red-400"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  {reqError}
                </div>
              )}

              {reqSuccess && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-green-400"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {reqSuccess}
                </div>
              )}

              <button type="submit" disabled={reqLoading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm">
                {reqLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Enviando...
                  </span>
                ) : 'Enviar Solicitação'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Acesso exclusivo para usuários autorizados
        </p>
      </div>
    </div>
  );
}
