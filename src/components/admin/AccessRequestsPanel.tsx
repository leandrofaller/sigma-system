'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Clock, User, Mail, MessageSquare, ChevronDown } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface AccessRequest {
  id: string;
  name: string;
  email: string;
  message: string | null;
  status: string;
  createdAt: string;
}

interface Group {
  id: string;
  name: string;
}

interface Props {
  requests: AccessRequest[];
  groups: Group[];
}

export function AccessRequestsPanel({ requests: initialRequests, groups }: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [processing, setProcessing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approveData, setApproveData] = useState<Record<string, { groupId: string; role: string; tempPassword: string }>>({});

  const pending = requests.filter((r) => r.status === 'PENDING');
  const reviewed = requests.filter((r) => r.status !== 'PENDING');

  const getApproveData = (id: string) =>
    approveData[id] || { groupId: '', role: 'OPERATOR', tempPassword: '' };

  const setField = (id: string, field: string, value: string) => {
    setApproveData((prev) => ({ ...prev, [id]: { ...getApproveData(id), [field]: value } }));
  };

  const handleAction = async (id: string, action: 'APPROVED' | 'DENIED') => {
    setProcessing(id);
    try {
      const data = getApproveData(id);
      const res = await fetch(`/api/access-requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          groupId: data.groupId || null,
          role: data.role || 'OPERATOR',
          tempPassword: data.tempPassword || null,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: action } : r));
        setExpanded(null);
        if (action === 'APPROVED' && result.tempPassword) {
          alert(`Usuário criado!\nSenha temporária: ${result.tempPassword}\n\nCompartilhe com o usuário de forma segura.`);
        }
      } else {
        alert(result.error || 'Erro ao processar solicitação.');
      }
    } finally {
      setProcessing(null);
    }
  };

  if (pending.length === 0 && reviewed.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <Clock className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm font-medium text-body">Nenhuma solicitação de acesso</p>
        <p className="text-xs text-subtle mt-1">Novas solicitações aparecerão aqui</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-subtle uppercase tracking-wider mb-3">
            Pendentes ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map((req) => {
              const isExpanded = expanded === req.id;
              const data = getApproveData(req.id);
              return (
                <div key={req.id} className="card overflow-hidden">
                  <div className="card-header flex items-center gap-3">
                    <div className="w-9 h-9 icon-badge-yellow rounded-lg flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-title truncate">{req.name}</p>
                      <p className="text-xs text-subtle flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {req.email}
                      </p>
                    </div>
                    <span className="text-xs text-subtle">{formatDateTime(req.createdAt)}</span>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : req.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-subtle transition-colors"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {req.message && (
                    <div className="px-4 pb-3 flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-subtle mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-body italic">{req.message}</p>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                      <p className="text-xs font-medium text-subtle uppercase tracking-wide">Configurar aprovação</p>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-subtle mb-1">Função</label>
                          <select
                            value={data.role}
                            onChange={(e) => setField(req.id, 'role', e.target.value)}
                            className="w-full input-base text-sm py-2"
                          >
                            <option value="OPERATOR">Operador</option>
                            <option value="ADMIN">Administrador</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-subtle mb-1">Grupo / Setor</label>
                          <select
                            value={data.groupId}
                            onChange={(e) => setField(req.id, 'groupId', e.target.value)}
                            className="w-full input-base text-sm py-2"
                          >
                            <option value="">Nenhum</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-subtle mb-1">Senha temporária <span className="text-gray-400">(deixe em branco para gerar automaticamente)</span></label>
                        <input
                          type="text"
                          value={data.tempPassword}
                          onChange={(e) => setField(req.id, 'tempPassword', e.target.value)}
                          placeholder="Ex: Acesso@2024"
                          className="w-full input-base text-sm py-2"
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleAction(req.id, 'APPROVED')}
                          disabled={processing === req.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Aprovar e Criar Usuário
                        </button>
                        <button
                          onClick={() => handleAction(req.id, 'DENIED')}
                          disabled={processing === req.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 rounded-lg text-sm font-medium transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Recusar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-subtle uppercase tracking-wider mb-3">
            Analisadas ({reviewed.length})
          </h3>
          <div className="space-y-2">
            {reviewed.map((req) => (
              <div key={req.id} className="card card-header flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  req.status === 'APPROVED' ? 'icon-badge-green' : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                }`}>
                  {req.status === 'APPROVED'
                    ? <CheckCircle className="w-4 h-4" />
                    : <XCircle className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-title truncate">{req.name}</p>
                  <p className="text-xs text-subtle">{req.email}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  req.status === 'APPROVED'
                    ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                }`}>
                  {req.status === 'APPROVED' ? 'Aprovado' : 'Recusado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
