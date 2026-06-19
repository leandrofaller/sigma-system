'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanFace, Search, RefreshCw, Trash2, Check, X,
  ShieldCheck, ShieldOff, Clock, Users, Sliders,
  History, Smartphone, Laptop, Info, Calendar, ShieldAlert, Eye
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
  avatar: string | null;
  group: { id: string; name: string } | null;
}

interface FaceLog {
  id: string;
  userId: string | null;
  action: string;
  details: {
    distance?: string;
    threshold?: string;
    success?: boolean;
    photoPath?: string | null;
  } | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

type FilterStatus = 'all' | 'with_face' | 'without_face';

const roleColors: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  ADMIN:       'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  OPERATOR:    'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

// Parser amigável de User-Agent no frontend
function parseUserAgent(ua: string | null): { device: string; browser: string; isMobile: boolean; isIphone: boolean } {
  if (!ua) return { device: 'Desconhecido', browser: 'Desconhecido', isMobile: false, isIphone: false };
  
  let device = 'Computador';
  let browser = 'Navegador';
  let isMobile = false;
  let isIphone = false;
  
  // Detecção de Dispositivo
  if (ua.includes('iPhone')) {
    const match = ua.match(/OS (\d+_\d+)/);
    const os = match ? `iOS ${match[1].replace('_', '.')}` : 'iOS';
    device = `iPhone (${os})`;
    isMobile = true;
    isIphone = true;
  } else if (ua.includes('iPad')) {
    device = 'iPad';
    isMobile = true;
  } else if (ua.includes('Android')) {
    const match = ua.match(/Android (\d+)/);
    const os = match ? `Android ${match[1]}` : 'Android';
    device = `Android (${os})`;
    isMobile = true;
  } else if (ua.includes('Windows NT')) {
    const match = ua.match(/Windows NT (\d+\.\d+)/);
    let winVer = 'Windows';
    if (match) {
      if (match[1] === '10.0') winVer = 'Windows 10/11';
      else if (match[1] === '6.3') winVer = 'Windows 8.1';
      else if (match[1] === '6.2') winVer = 'Windows 8';
      else if (match[1] === '6.1') winVer = 'Windows 7';
    }
    device = winVer;
  } else if (ua.includes('Macintosh')) {
    device = 'macOS';
  } else if (ua.includes('Linux')) {
    device = 'Linux';
  }

  // Detecção de Navegador
  if (ua.includes('Firefox/')) {
    browser = 'Firefox';
  } else if (ua.includes('Chrome/')) {
    browser = 'Chrome';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    browser = 'Safari';
  } else if (ua.includes('Edge/')) {
    browser = 'Edge';
  }

  return { device, browser, isMobile, isIphone };
}

export function FaceAdminPanel() {
  const [users, setUsers] = useState<FaceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [toast, setToast] = useState<{ id: number; type: 'success' | 'error'; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<FaceUser | null>(null);

  // Configurações de Threshold
  const [threshold, setThreshold] = useState(0.40);
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Estados dos Logs
  const [selectedUser, setSelectedUser] = useState<FaceUser | null>(null);
  const [logs, setLogs] = useState<FaceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Visualização ampliada de Foto
  const [hoveredPhoto, setHoveredPhoto] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now();
    setToast({ id, type, text });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 4000);
  }, []);

  // Carrega usuários e status facial
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

  // Carrega threshold atual
  const loadThreshold = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/face-auth/config');
      if (res.ok) {
        const data = await res.json();
        if (typeof data.threshold === 'number') {
          setThreshold(data.threshold);
        }
      }
    } catch (err) {
      console.error('Erro ao ler threshold:', err);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadThreshold();
  }, [loadUsers, loadThreshold]);

  // Atualiza Threshold no servidor
  const handleSaveThreshold = async () => {
    setSavingThreshold(true);
    try {
      const res = await fetch('/api/admin/face-auth/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar configuração');
      showToast('success', `Sensibilidade de precisão atualizada para ${threshold.toFixed(2)}.`);
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao salvar configuração.');
    } finally {
      setSavingThreshold(false);
    }
  };

  // Abre os logs do usuário selecionado
  const handleViewLogs = async (user: FaceUser) => {
    setSelectedUser(user);
    setLoadingLogs(true);
    setLogs([]);
    try {
      const res = await fetch(`/api/admin/face-auth/logs?userId=${user.id}`);
      if (!res.ok) throw new Error('Erro ao buscar histórico');
      const data = await res.json();
      setLogs(data);
    } catch {
      showToast('error', 'Não foi possível obter o histórico de biometria.');
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleDeleteLoginPhoto = async (logId: string) => {
    if (!confirm('Deseja excluir permanentemente a foto deste login?')) return;
    try {
      const res = await fetch(`/api/admin/face-auth/logs?id=${logId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao deletar foto');
      
      // Atualiza o estado local
      setLogs((prev) =>
        prev.map((log) =>
          log.id === logId
            ? { ...log, details: log.details ? { ...log.details, photoPath: null } : null }
            : log
        )
      );
      showToast('success', 'Foto de login excluída com sucesso.');
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao deletar foto de login.');
    }
  };

  const handleRemoveFace = async (user: FaceUser) => {
    setConfirmRemove(null);
    setActionLoading(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}/face`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao remover face');
      setUsers((prev) => prev.map((u) =>
        u.id === user.id ? { ...u, hasFace: false, faceRegisteredAt: null, avatar: null } : u
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

  // Função auxiliar para analisar diagnósticos dos logs
  const getDiagnosticMessage = (log: FaceLog) => {
    if (!log.details) return null;
    const distanceVal = parseFloat(log.details.distance || '0');
    const thresholdVal = parseFloat(log.details.threshold || '0.40');
    const uaInfo = parseUserAgent(log.userAgent);

    if (log.details.success) {
      return {
        type: 'success' as const,
        text: 'Autenticação bem-sucedida. O rosto correspondeu à referência dentro do limite aceitável.',
      };
    }

    if (uaInfo.isIphone && distanceVal > thresholdVal && distanceVal <= thresholdVal + 0.08) {
      return {
        type: 'warning' as const,
        text: `Identificado iPhone (iOS Safari). A distância foi de ${distanceVal.toFixed(4)}, o que excede levemente o threshold de ${thresholdVal.toFixed(2)}. As câmeras do iPhone às vezes apresentam maiores variações sob pouca luz. Recomendamos subir o threshold geral para ${(thresholdVal + 0.03).toFixed(2)} ou refazer o cadastro facial em um ambiente mais iluminado.`,
      };
    }

    if (distanceVal > thresholdVal && distanceVal <= thresholdVal + 0.05) {
      return {
        type: 'warning' as const,
        text: `A biometria falhou por muito pouco (Diferença de ${(distanceVal - thresholdVal).toFixed(4)}). Isso geralmente é causado por variações de iluminação, ângulo ou óculos. Considere aumentar ligeiramente o Threshold de Precisão no slider acima ou orientar o usuário a refazer a foto.`,
      };
    }

    if (distanceVal > 0.65) {
      return {
        type: 'danger' as const,
        text: 'Distância muito elevada. O rosto capturado é substancialmente diferente do registrado. Pode ser outra pessoa ou uma imagem extremamente desfocada/obstruída.',
      };
    }

    return {
      type: 'info' as const,
      text: 'O rosto foi detectado mas a distância excedeu a margem de segurança configurada.',
    };
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
            {toast.type === 'success' ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <X className="w-4 h-4 flex-shrink-0" />
            )}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Lightbox de Foto */}
      <AnimatePresence>
        {photoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.8)' }}
            onClick={() => setPhotoModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-lg w-full bg-black rounded-3xl overflow-hidden shadow-2xl border border-gray-800"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoModal} alt="Rosto cadastrado" className="w-full h-auto max-h-[70vh] object-contain mx-auto" />
              <button
                onClick={() => setPhotoModal(null)}
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </motion.div>
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

      {/* Modal de Logs de Auditoria */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-end"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setSelectedUser(null)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl h-full bg-white dark:bg-gray-900 border-l border-gray-100 dark:border-gray-800 shadow-2xl flex flex-col"
            >
              {/* Header do Modal de Logs */}
              <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sigma-50 dark:bg-sigma-900/30 flex items-center justify-center text-sigma-600">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Histórico Biométrico</h3>
                    <p className="text-xs text-gray-400 font-medium">{selectedUser.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-subtle transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Corpo do Modal de Logs */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {loadingLogs ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-subtle">
                    <RefreshCw className="w-6 h-6 animate-spin text-sigma-500" />
                    <span className="text-sm">Carregando tentativas de acesso...</span>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center text-subtle">
                    <Clock className="w-12 h-12 opacity-25" />
                    <p className="text-sm">Nenhum login por reconhecimento facial registrado</p>
                    <p className="text-xs max-w-xs">Tentativas malsucedidas com e-mails inválidos não geram logs para proteção contra varredura.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {logs.map((log) => {
                      const uaInfo = parseUserAgent(log.userAgent);
                      const diag = getDiagnosticMessage(log);
                      const distance = parseFloat(log.details?.distance || '0');
                      const thresh = parseFloat(log.details?.threshold || '0.40');

                      return (
                        <div
                          key={log.id}
                          className={`border rounded-2xl p-4 transition-all ${
                            log.details?.success
                              ? 'bg-green-50/20 dark:bg-green-900/5 border-green-100 dark:border-green-950'
                              : 'bg-red-50/20 dark:bg-red-900/5 border-red-100 dark:border-red-950'
                          }`}
                        >
                          {/* Cabeçalho da Tentativa */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                log.details?.success
                                  ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400'
                                  : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400'
                              }`}>
                                {log.details?.success ? 'Sucesso' : 'Recusado'}
                              </span>
                              <span className="text-xs text-subtle flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatDate(log.createdAt)}
                              </span>
                            </div>
                            <div className="text-xs font-semibold font-mono text-body">
                              Dist: {distance.toFixed(4)}
                              <span className="text-subtle font-normal"> / Limiar: {thresh.toFixed(2)}</span>
                            </div>
                          </div>

                          {/* Metadados da Conexão */}
                          <div className="grid grid-cols-2 gap-2 text-xs text-subtle font-medium border-t border-b border-gray-100/50 dark:border-gray-800/50 py-2 mb-3">
                            <div className="flex items-center gap-1.5">
                              {uaInfo.isMobile ? (
                                <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                              ) : (
                                <Laptop className="w-3.5 h-3.5 text-gray-500" />
                              )}
                              <span>{uaInfo.device}</span>
                            </div>
                            <div className="text-right flex items-center justify-end gap-1.5">
                              <span className="font-mono text-[11px]">{log.ipAddress || 'IP Oculto'}</span>
                            </div>
                            <div className="col-span-2 text-left text-[11px] italic font-mono text-gray-400 truncate" title={log.userAgent || ''}>
                              UA: {uaInfo.browser} ({log.userAgent})
                            </div>
                          </div>

                          {/* Foto Capturada no Login */}
                          {log.details?.photoPath ? (
                            <div className="mt-2 mb-3 relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 aspect-[4/3] max-w-[200px] group/photo">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/admin/face-auth/logs/photo?id=${log.id}`}
                                alt="Foto do login"
                                className="w-full h-full object-cover cursor-zoom-in"
                                onClick={() => setPhotoModal(`/api/admin/face-auth/logs/photo?id=${log.id}`)}
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLoginPhoto(log.id);
                                }}
                                title="Excluir foto de login"
                                className="absolute top-1.5 right-1.5 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg opacity-0 group-hover/photo:opacity-100 transition-opacity shadow-lg"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : log.action === 'FACE_LOGIN_ATTEMPT' && (
                            <p className="text-xs text-subtle italic mt-1 mb-3">Foto não disponível ou excluída pelo administrador.</p>
                          )}

                          {/* Diagnóstico Inteligente */}
                          {diag && (
                            <div className={`flex gap-2 p-2.5 rounded-xl text-xs leading-normal ${
                              diag.type === 'success' ? 'bg-green-100/30 dark:bg-green-950/20 text-green-800 dark:text-green-400'
                              : diag.type === 'warning' ? 'bg-orange-100/30 dark:bg-orange-950/20 text-orange-800 dark:text-orange-400'
                              : diag.type === 'danger' ? 'bg-red-100/30 dark:bg-red-950/20 text-red-800 dark:text-red-400'
                              : 'bg-gray-100/50 dark:bg-gray-800/50 text-subtle'
                            }`}>
                              <Info className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>{diag.text}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid Superior: Estatísticas + Configuração de Threshold */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bloco de Estatísticas */}
        <div className="lg:col-span-2 grid grid-cols-3 gap-4">
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
              className={`${stat.bg} rounded-2xl p-5 border border-transparent flex flex-col justify-between`}
            >
              <div className={`${stat.color} mb-3`}>{stat.icon}</div>
              <div>
                <p className="text-3xl font-bold text-title">{stat.value}</p>
                <p className="text-xs text-subtle mt-1">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bloco de Configuração de Precisão (Slider) */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-semibold text-sm">
              <Sliders className="w-4 h-4 text-sigma-600" />
              Sensibilidade de Precisão
            </div>
            <p className="text-xs text-subtle">Ajuste o limite de distância aceitável</p>
          </div>

          <div className="my-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-gray-500">Mais Seguro (Rígido)</span>
              <span className="text-sigma-600 text-sm font-bold bg-sigma-50 dark:bg-sigma-900/30 px-2 py-0.5 rounded-lg border border-sigma-200 dark:border-sigma-850">
                {threshold.toFixed(2)}
              </span>
              <span className="text-gray-500">Mais Permissivo</span>
            </div>
            <input
              type="range"
              min="0.30"
              max="0.60"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-sigma-600"
            />
            <div className="flex justify-between text-[10px] text-subtle font-medium px-1">
              <span>0.30</span>
              <span>0.40 (Padrão)</span>
              <span>0.50</span>
              <span>0.60</span>
            </div>
          </div>

          <div className="space-y-2 shrink-0">
            <p className="text-[10px] leading-snug text-subtle">
              * Valores entre **0.42 e 0.45** ajudam a mitigar erros em iPhones/dispositivos móveis sem comprometer gravemente a segurança corporativa do sistema.
            </p>
            <button
              onClick={handleSaveThreshold}
              disabled={savingThreshold}
              className="w-full py-2 bg-sigma-600 hover:bg-sigma-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              {savingThreshold ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Salvar Sensibilidade
            </button>
          </div>
        </div>
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
        <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-900">
          {([
            { key: 'all', label: 'Todos' },
            { key: 'with_face', label: 'Com face' },
            { key: 'without_face', label: 'Sem face' },
          ] as { key: FilterStatus; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3.5 py-2 text-xs font-medium transition-colors ${
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
          className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-subtle hover:text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 bg-white dark:bg-gray-900"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden relative">
        {/* Lightbox em hover rápido */}
        {hoveredPhoto && (
          <div
            className="absolute z-30 pointer-events-none p-1.5 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl"
            style={{
              top: '50%',
              left: '20px',
              transform: 'translateY(-50%)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hoveredPhoto} alt="Zoom" className="w-32 h-32 rounded-xl object-cover" />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-subtle bg-white dark:bg-gray-900">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando usuários...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-subtle bg-white dark:bg-gray-900">
            <ScanFace className="w-10 h-10 opacity-30" />
            <p className="text-sm">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <table className="w-full bg-white dark:bg-gray-900">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
                <th className="text-left text-xs font-semibold text-subtle px-6 py-4">Usuário / Face</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Função</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">Grupo</th>
                <th className="text-left text-xs font-semibold text-subtle px-4 py-4">
                  <div className="flex items-center gap-1.5">
                    <ScanFace className="w-3.5 h-3.5" />
                    Status Biométrico
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
                    className="hover:bg-gray-50/30 dark:hover:bg-gray-800/20 transition-colors"
                  >
                    {/* Nome + foto */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.hasFace && user.avatar ? (
                          <div
                            onClick={() => setPhotoModal(user.avatar)}
                            onMouseEnter={() => setHoveredPhoto(user.avatar)}
                            onMouseLeave={() => setHoveredPhoto(null)}
                            className="w-10 h-10 rounded-xl overflow-hidden cursor-zoom-in border border-gray-200 dark:border-gray-700 shrink-0 relative hover:border-sigma-500 transition-colors"
                            title="Clique para ampliar"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/10 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Eye className="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-sigma-50 dark:bg-sigma-900/35 border border-sigma-100 dark:border-sigma-850 rounded-xl flex items-center justify-center text-sm font-bold text-sigma-600 shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-title leading-tight">{user.name}</p>
                          <p className="text-xs text-subtle">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Função */}
                    <td className="px-4 py-4">
                      <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold ${roleColors[user.role]}`}>
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
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded-full">
                              <Check className="w-3 h-3" />
                              Cadastrada
                            </span>
                          </div>
                          {user.faceRegisteredAt && (
                            <p className="text-[10px] text-subtle flex items-center gap-1 font-medium">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDate(user.faceRegisteredAt)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">
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
                          <>
                            <button
                              onClick={() => handleViewLogs(user)}
                              title="Histórico biométrico e diagnósticos"
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-sigma-600 dark:hover:text-sigma-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
                            >
                              <History className="w-3.5 h-3.5" />
                              Logs
                            </button>
                            <button
                              onClick={() => setConfirmRemove(user)}
                              disabled={actionLoading === user.id}
                              title="Remover cadastro facial"
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {actionLoading === user.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              Remover
                            </button>
                          </>
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
        {' · '}O Super Administrador pode configurar o limiar do algoritmo, inspecionar logs de tentativas com geolocalização e revogar cadastros faciais.
      </p>
    </div>
  );
}
