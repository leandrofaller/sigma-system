'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function DevicePendingPage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [time] = useState(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

  useEffect(() => {
    document.title = 'Verificação de Acesso — LogiTrack Express';
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ redirect: false });
    router.push('/login');
  }

  function handleRetry() {
    router.push('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
      <div className="w-full max-w-md animate-fade-in">

        {/* Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
            <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Acesso em Análise</h1>
          <p className="text-gray-400 text-sm mt-1">Portal do Cliente — LogiTrack Express</p>
        </div>

        {/* Card */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-2xl p-8 space-y-6">

          <div className="text-center">
            <p className="text-gray-300 text-sm leading-relaxed">
              Sua solicitação de acesso ao Portal LogiTrack está sendo verificada
              pela equipe de segurança. Você receberá confirmação assim que
              a análise for concluída.
            </p>
          </div>

          {/* Info box */}
          <div className="rounded-xl px-4 py-3 space-y-2"
            style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
              </svg>
              <span className="text-yellow-400 text-xs font-medium">Dispositivo não reconhecido</span>
            </div>
            <p className="text-gray-500 text-xs pl-5">
              Solicitação registrada às {time}. Aguardando aprovação do administrador.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
            >
              Já fui aprovado — Entrar novamente
            </button>

            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full text-gray-400 hover:text-red-400 font-medium py-2.5 rounded-xl transition-colors text-sm disabled:opacity-50"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {signingOut ? 'Saindo...' : 'Sair'}
            </button>
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Acesso exclusivo para usuários autorizados
        </p>
      </div>
    </div>
  );
}
