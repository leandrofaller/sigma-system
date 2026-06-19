'use client';

import { useState } from 'react';
import { PainelDiretorRIP } from './PainelDiretorRIP';
import { RelatoriosForcaTarefaList } from './RelatoriosForcaTarefaList';
import { UserCheck, Shield, Eye, ArrowLeftRight } from 'lucide-react';

interface Props {
  relatorios: any[];
  user: {
    id: string;
    name: string;
    role: string;
    groupId?: string | null;
    groupName?: string | null;
  };
}

export function ForcaTarefaDashboardWrapper({ relatorios, user }: Props) {
  const [simulatingOperator, setSimulatingOperator] = useState(false);

  const realIsAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  // Define se o layout exibido deve ser o do Admin
  const showAdminDashboard = realIsAdmin && !simulatingOperator;

  return (
    <div className="space-y-6">
      {/* Barra de controle de simulação exclusiva para Admins */}
      {realIsAdmin && (
        <div className={`card p-3 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs transition-all duration-300 ${
          simulatingOperator 
            ? 'bg-amber-500/10 border-amber-500/20' 
            : 'bg-white/70 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800'
        }`}>
          <div className="flex items-center gap-2.5 text-xs text-body font-medium">
            <div className={`p-2 rounded-lg border ${
              simulatingOperator 
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                : 'bg-sigma-500/10 border-sigma-500/20 text-sigma-500'
            }`}>
              {simulatingOperator ? <UserCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
            </div>
            <div>
              <span className="block font-bold text-title">
                {simulatingOperator 
                  ? 'Modo Simulação Operador Ativo' 
                  : 'Ambiente Administrativo de Risco Prisional'}
              </span>
              <span className="block text-[10px] text-subtle mt-0.5">
                {simulatingOperator 
                  ? 'Você está testando a navegação com as restrições e formulário de preenchimento de um operador.' 
                  : `Seu perfil atual é ${user.role.replace('_', ' ')}. Use o botão ao lado para simular um operador comum.`}
              </span>
            </div>
          </div>

          <button
            onClick={() => setSimulatingOperator(!simulatingOperator)}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-xs ${
              simulatingOperator 
                ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600' 
                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/80 border-gray-200 dark:border-gray-700 text-title'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {simulatingOperator ? 'Voltar para Visão Administrador' : 'Simular Visão de Operador'}
          </button>
        </div>
      )}

      {/* Renderização condicional do Painel Gerencial ou Lista Comum */}
      {showAdminDashboard ? (
        <PainelDiretorRIP
          relatorios={relatorios}
          sessionUser={{ id: user.id, name: user.name, role: user.role }}
        />
      ) : (
        <div className="space-y-4">
          {simulatingOperator && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-bold uppercase tracking-wider w-fit">
              <Eye className="w-3.5 h-3.5 animate-pulse" />
              Simulando perfil: OPERADOR (NI / AIP)
            </div>
          )}
          
          <RelatoriosForcaTarefaList
            relatorios={relatorios}
            role={simulatingOperator ? 'OPERATOR' : user.role}
            userId={user.id}
            userGroupId={user.groupId ?? ''}
            userGroupName={user.groupName ?? ''}
          />
        </div>
      )}
    </div>
  );
}
