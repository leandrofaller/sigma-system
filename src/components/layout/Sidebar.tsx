'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FileText, Inbox, MessageSquare, Sparkles,
  Users, Settings, ClipboardList, ChevronLeft,
  ChevronRight, Package, LogOut, FolderOpen, UserCircle, MapPin, Map, Database, BookOpen, Calendar, Menu, X, Trello, Smartphone, UserCheck, Monitor, Shield, Brain, AlertCircle, CalendarDays, Building2, ShieldAlert, List, Paintbrush, Archive, Briefcase,
  Target, Check, Loader2, LifeBuoy
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import type { SessionUser } from '@/types';

export interface NavItem {
  id?: string;
  label: string;
  href: string;
  iconName: string;
  roles?: string[];
  badge?: number;
  badgePulse?: boolean;
}

export const iconMap: Record<string, React.ComponentType<any>> = {
  LayoutDashboard, FileText, Inbox, BookOpen, ClipboardList, Calendar, CalendarDays,
  Trello, MessageSquare, Sparkles, UserCheck, Shield, Database, Smartphone, Brain, Building2,
  Users, FolderOpen, Monitor, MapPin, Map, AlertCircle, Settings, ShieldAlert, List, Paintbrush, Archive, Briefcase, LifeBuoy
};

export const defaultNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', iconName: 'LayoutDashboard', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Relatórios (RELINTs)', href: '/relints', iconName: 'FileText', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'RELINTs Recebidos', href: '/relints-recebidos', iconName: 'Inbox', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Arquivo', href: '/arquivo', iconName: 'Archive', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Debriefings', href: '/debriefings', iconName: 'BookOpen', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Força-Tarefa', href: '/forca-tarefa', iconName: 'ClipboardList', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Calendário de Missões', href: '/missoes', iconName: 'Calendar', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Mural de Eventos', href: '/mural', iconName: 'CalendarDays', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Acompanhamento', href: '/acompanhamento', iconName: 'Trello', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Chat Interno', href: '/chat', iconName: 'MessageSquare', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Consulta IA', href: '/ia', iconName: 'Sparkles', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Identificação de Apenados', href: '/apenados', iconName: 'UserCheck', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Apenados & Facções', href: '/faccoes', iconName: 'Shield', roles: ['SUPER_ADMIN'] },
  { label: 'Visitantes', href: '/visitantes', iconName: 'Users', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Servidores', href: '/servidores', iconName: 'Briefcase', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Mapa de Facções', href: '/mapa-faccoes', iconName: 'Map', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Lista de Endereços', href: '/lista-enderecos', iconName: 'List', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'SIAIP', href: '/siaip', iconName: 'Database', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Celulares Recebidos', href: '/aparelhos', iconName: 'Smartphone', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'AIP', href: '/aip', iconName: 'Brain', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Pichações e Simbologias', href: '/pichacoes', iconName: 'Paintbrush', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Ordens de Missão', href: '/ordens-missao', iconName: 'ClipboardList', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
  { label: 'Unidades Prisionais', href: '/unidades-prisionais', iconName: 'Building2', roles: ['SUPER_ADMIN'] },
  { label: 'Suporte', href: '/suporte', iconName: 'LifeBuoy', roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] },
];

export const defaultAdminItems: NavItem[] = [
  { label: 'Usuários', href: '/admin/usuarios', iconName: 'Users', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Grupos / Setores', href: '/admin/grupos', iconName: 'FolderOpen', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Dispositivos', href: '/admin/dispositivos', iconName: 'Monitor', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Monitoramento', href: '/admin/monitoramento', iconName: 'MapPin', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Cercas Geográficas', href: '/admin/cercas-geograficas', iconName: 'Locate', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Avisos de Manutenção', href: '/admin/manutencao', iconName: 'AlertCircle', roles: ['SUPER_ADMIN'] },
  { label: 'Auditoria', href: '/auditoria', iconName: 'ClipboardList', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Higienização de Fotos', href: '/admin/sanitizacao', iconName: 'ShieldAlert', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Backups', href: '/admin/backups', iconName: 'Database', roles: ['SUPER_ADMIN'] },
  { label: 'Configurações', href: '/admin/configuracoes', iconName: 'Settings', roles: ['SUPER_ADMIN'] },
];

export function sortItems(items: NavItem[], orderHrefs: string[]) {
  if (!orderHrefs || !Array.isArray(orderHrefs) || orderHrefs.length === 0) return items;
  const orderMap = new globalThis.Map(orderHrefs.map((href, index) => [href, index]));
  
  return [...items].sort((a, b) => {
    const idxA = orderMap.get(a.href);
    const idxB = orderMap.get(b.href);
    if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
    if (idxA !== undefined) return -1;
    if (idxB !== undefined) return 1;
    return 0;
  });
}

export interface SidebarProps {
  user: SessionUser;
  logoSize?: number;
  pendingDeviceCount?: number;
  sidebarOrder?: { nav?: string[]; admin?: string[] };
}

interface ChatChannel {
  type: 'direct' | 'group';
  id: string;
  name: string;
  unread: number;
}

export function Sidebar({ user, logoSize = 36, pendingDeviceCount = 0, sidebarOrder }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>([]);
  const [isMobileDashboard, setIsMobileDashboard] = useState(false);
  const [ordemPendente, setOrdemPendente] = useState(0);
  const [latestOrdem, setLatestOrdem] = useState<{ id: string; numero: string; titulo: string } | null>(null);
  const [givingCiencia, setGivingCiencia] = useState(false);
  const [dossierPendente, setDossierPendente] = useState(0);
  const [latestDossierRequest, setLatestDossierRequest] = useState<any>(null);
  const prevCountRef = useRef(0);
  const prevOrdemRef = useRef(0);
  const prevDossierRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pendingOrdemSoundRef = useRef(false);
  const pendingDossierSoundRef = useRef(false);
  const pathname = usePathname();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  // Controle de Abas Estáticas baseadas em regras de acesso e reordenação resiliente
  const orderedNavItems = sortItems(defaultNavItems, sidebarOrder?.nav ?? []);
  const orderedAdminItems = sortItems(defaultAdminItems, sidebarOrder?.admin ?? []);

  const navItems = orderedNavItems.filter(
    (item) => !item.roles || item.roles.includes(user?.role ?? '')
  );
  const adminItems = orderedAdminItems.filter(
    (item) => !item.roles || item.roles.includes(user?.role ?? '')
  );

  // Fecha o drawer mobile quando o usuário navega
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Abre o menu móvel automaticamente se estiver no celular e na página inicial (/dashboard)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent || '';
      const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
      const isHome = isMobile && pathname === '/dashboard';
      setIsMobileDashboard(isHome);
      if (isHome) {
        setMobileOpen(true);
      }
    }
  }, [pathname]);

  // Trava o scroll do body quando o drawer mobile está aberto
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [mobileOpen]);

  // Polling de mensagens não lidas + notificação nativa
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    async function poll() {
      try {
        const res = await fetch('/api/chat/unread');
        if (!res.ok) return;
        const { count, channels } = await res.json() as { count: number; channels: ChatChannel[] };

        if (count > prevCountRef.current && pathname !== '/chat') {
          if (Notification.permission === 'granted' && document.hidden) {
            const names = channels
              .filter((c) => c.unread > 0)
              .map((c) => c.name)
              .join(', ');
            new Notification(
              names
                ? `Nova mensagem de ${names}`
                : 'Nova mensagem — Chat Interno',
              {
                body: `${count} mensagem${count !== 1 ? 's' : ''} não lida${count !== 1 ? 's' : ''}.`,
                icon: '/logos/badge-aip.png',
              }
            );
          }
        }

        prevCountRef.current = count;
        setChatUnreadCount(count);
        setChatChannels(channels ?? []);
      } catch {}
    }

    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, [pathname]);

  // Zera imediatamente ao entrar no chat
  useEffect(() => {
    if (pathname === '/chat') {
      setChatUnreadCount(0);
      setChatChannels([]);
      prevCountRef.current = 0;
    }
  }, [pathname]);

  // Toca os 3 tons de alerta. Retorna true se tocou, false se o contexto ainda não estava ativo.
  const playOrdemSoundNow = useCallback(() => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state !== 'running') return false;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 — acorde maior ascendente
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.28, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        osc.start(t);
        osc.stop(t + 0.39);
      });
      return true;
    } catch { return false; }
  }, []);

  // Toca o som de sucesso ao dar ciência
  const playSuccessSound = useCallback(() => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state !== 'running') return;
      const notes = [659.25, 880.00]; // E5, A5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.08;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.22);
      });
    } catch {}
  }, []);

  // Handler para ciência imediata pelo banner mobile
  const handleDarCiencia = async (ordemId: string) => {
    setGivingCiencia(true);
    try {
      const res = await fetch(`/api/aip/ordens-missao/${ordemId}/ciencia`, {
        method: 'POST',
      });
      if (res.ok) {
        playSuccessSound();
        // Recarrega contagem de ordens pendentes
        const nextRes = await fetch('/api/aip/ordens-missao/pendentes-ciencia');
        if (nextRes.ok) {
          const { count, latest } = await nextRes.json() as { count: number; latest: { id: string; numero: string; titulo: string } | null };
          setOrdemPendente(count);
          setLatestOrdem(latest);
          prevOrdemRef.current = count;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Erro ao registrar ciência.');
      }
    } catch {
      alert('Erro de conexão ao registrar ciência.');
    } finally {
      setGivingCiencia(false);
    }
  };

  // Na primeira interação do usuário: cria/retoma o AudioContext e toca qualquer som pendente
  useEffect(() => {
    const activate = async () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }
        if (audioCtxRef.current.state === 'suspended') {
          await audioCtxRef.current.resume();
        }
        if (pendingOrdemSoundRef.current || pendingDossierSoundRef.current) {
          pendingOrdemSoundRef.current = false;
          pendingDossierSoundRef.current = false;
          playOrdemSoundNow();
        }
      } catch {}
    };
    document.addEventListener('click', activate, { passive: true });
    document.addEventListener('keydown', activate, { passive: true });
    return () => {
      document.removeEventListener('click', activate);
      document.removeEventListener('keydown', activate);
    };
  }, [playOrdemSoundNow]);

  // Polling de Ordens de Missão pendentes
  useEffect(() => {
    async function pollOrdens() {
      try {
        const res = await fetch('/api/aip/ordens-missao/pendentes-ciencia');
        if (!res.ok) return;
        const { count, latest } = await res.json() as { count: number; latest: { id: string; numero: string; titulo: string } | null };

        if (count > prevOrdemRef.current) {
          // Tenta tocar imediatamente; se o contexto ainda não foi ativado, fica pendente
          const played = playOrdemSoundNow();
          if (!played) pendingOrdemSoundRef.current = true;

          if (Notification.permission === 'granted' && document.hidden && latest) {
            new Notification('🎯 Nova Ordem de Missão', {
              body: `${latest.numero} — ${latest.titulo}\nAcesse Ordens de Missão para dar ciência.`,
              icon: '/logos/badge-aip.png',
            });
          }
        }
        prevOrdemRef.current = count;
        setOrdemPendente(count);
        setLatestOrdem(latest);
      } catch {}
    }

    pollOrdens();
    const id = setInterval(pollOrdens, 30_000);
    return () => clearInterval(id);
  }, [playOrdemSoundNow]);

  // Polling de Solicitações de Dossiê pendentes (apenas SUPER_ADMIN e ADMIN)
  useEffect(() => {
    const isUserAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
    if (!isUserAdmin) return;

    async function pollDossiers() {
      try {
        const res = await fetch('/api/aip/dossier/request/pending-count');
        if (!res.ok) return;
        const { count, latest } = await res.json() as { count: number; latest: any };

        if (count > prevDossierRef.current) {
          const played = playOrdemSoundNow();
          if (!played) pendingDossierSoundRef.current = true;

          if (Notification.permission === 'granted' && document.hidden && latest) {
            new Notification('🔒 Solicitação de Dossiê', {
              body: `${latest.user?.name} solicitou acesso ao dossiê de ${latest.apenado?.nome}.\nAcesse Aprovações para avaliar.`,
              icon: '/logos/badge-aip.png',
            });
          }
        }
        prevDossierRef.current = count;
        setDossierPendente(count);
        setLatestDossierRequest(latest);
      } catch {}
    }

    pollDossiers();
    const id = setInterval(pollDossiers, 30_000);
    return () => clearInterval(id);
  }, [user?.role, playOrdemSoundNow]);

  // Repete som se houver solicitação de dossiê pendente (apenas para admin)
  useEffect(() => {
    if (dossierPendente === 0 || !latestDossierRequest) return;

    playOrdemSoundNow();

    const intervalId = setInterval(() => {
      playOrdemSoundNow();
    }, 15_000);

    return () => clearInterval(intervalId);
  }, [dossierPendente, latestDossierRequest, playOrdemSoundNow]);

  // Repete som se houver ordem pendente de ciência para o operador (mobile/desktop alert)
  useEffect(() => {
    if (ordemPendente === 0 || !latestOrdem) return;

    // Toca som ao iniciar
    playOrdemSoundNow();

    const intervalId = setInterval(() => {
      playOrdemSoundNow();
    }, 15_000);

    return () => clearInterval(intervalId);
  }, [ordemPendente, latestOrdem, playOrdemSoundNow]);

  const filteredNav = navItems.map((item) => {
    if (item.href === '/chat' && chatUnreadCount > 0)
      return { ...item, badge: chatUnreadCount, badgePulse: true };
    if (item.href === '/ordens-missao' && ordemPendente > 0)
      return { ...item, badge: ordemPendente, badgePulse: true };
    if (item.href === '/aip' && dossierPendente > 0)
      return { ...item, badge: dossierPendente, badgePulse: true };
    return item;
  });

  const filteredAdmin = adminItems
    .map((item) =>
      item.href === '/admin/dispositivos' && pendingDeviceCount > 0
        ? { ...item, badge: pendingDeviceCount }
        : item
    );

  return (
    <>
      {/* Botão hamburger — só no mobile */}
      {!isMobileDashboard && (
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden fixed top-3 left-3 z-30 w-10 h-10 bg-gray-900/90 backdrop-blur-md text-white rounded-xl shadow-lg flex items-center justify-center active:scale-95 transition"
          style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Menu Centralizado Mobile (Exclusivo) */}
      <AnimatePresence>
        {mobileOpen && (
          <div className={cn("md:hidden fixed inset-0 z-50 flex items-center justify-center", isMobileDashboard ? "p-0" : "p-4")}>
            {/* Backdrop com desfoque de fundo */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isMobileDashboard && setMobileOpen(false)}
              className={cn(
                "absolute inset-0",
                isMobileDashboard ? "bg-gray-950" : "bg-black/60 backdrop-blur-md"
              )}
            />

            {/* Painel Centralizado */}
            <motion.div
              initial={isMobileDashboard ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={isMobileDashboard ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className={cn(
                "relative flex flex-col overflow-hidden z-10 transition-all duration-300",
                isMobileDashboard
                  ? "w-full h-full max-h-[100dvh] bg-gray-950 p-6"
                  : "w-full max-w-sm max-h-[80vh] bg-gray-950/95 border border-gray-800/80 rounded-3xl p-5 shadow-2xl"
              )}
            >
              {/* Cabeçalho */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-800/80 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="relative w-8 h-8">
                    <Image
                      src="/logos/badge-aip.png"
                      alt="AIP"
                      fill
                      sizes="32px"
                      className="object-contain"
                    />
                  </div>
                  <div className="text-left">
                    <h3 className="text-white font-bold text-sm leading-tight">SIAIP</h3>
                    <p className="text-gray-500 text-[10px]">Menu de Navegação</p>
                  </div>
                </div>
                {!isMobileDashboard && (
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="w-7 h-7 rounded-full bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition active:scale-90"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Lista de Botões do Menu Principal */}
              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 scrollbar-none">
                <div className={cn(isMobileDashboard ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2")}>
                  {filteredNav.map((item, idx) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    const IconComponent = iconMap[item.iconName] || FileText;
                    return (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.02, type: 'spring', stiffness: 200 }}
                      >
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            isMobileDashboard
                              ? "relative flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all duration-200 active:scale-[0.98] w-full group gap-2 h-[105px]"
                              : "relative flex items-center gap-3.5 p-3 rounded-xl border text-left transition-all duration-200 active:scale-[0.98] w-full group",
                            isActive
                              ? "bg-sigma-600/10 border-sigma-500/40 text-white font-semibold shadow-md shadow-sigma-500/5"
                              : "bg-gray-900/40 border-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-800/30 hover:border-gray-700/50 hover:translate-x-1"
                          )}
                        >
                          <div className={cn(
                            isMobileDashboard
                              ? "w-10 h-10 rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
                              : "w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0",
                            isActive ? "bg-sigma-500 text-white" : "bg-gray-800 text-gray-400 group-hover:text-white"
                          )}>
                            <IconComponent className={cn(isMobileDashboard ? "w-5 h-5" : "w-4 h-4")} />
                          </div>
                          <div className={isMobileDashboard ? "min-w-0" : "flex-1 min-w-0 pr-6"}>
                            <span className={cn(
                              "text-xs leading-snug font-medium block text-white",
                              isMobileDashboard ? "text-center line-clamp-2 text-[11px]" : ""
                            )}>{item.label}</span>
                          </div>
                          {item.badge != null && item.badge > 0 && (
                            <span className={cn(
                              "absolute bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0",
                              isMobileDashboard ? "top-2 right-2" : "right-3"
                            )}>
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Lista de Botões de Administração */}
                {filteredAdmin.length > 0 && (
                  <div className="space-y-2 text-left">
                    <h4 className="text-[9px] font-semibold text-gray-600 uppercase tracking-wider px-1">
                      Administração
                    </h4>
                    <div className={cn(isMobileDashboard ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2")}>
                      {filteredAdmin.map((item, idx) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        const IconComponent = iconMap[item.iconName] || FileText;
                        return (
                          <motion.div
                            key={item.href}
                            initial={{ opacity: 0, x: -15 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: (filteredNav.length + idx) * 0.02, type: 'spring', stiffness: 200 }}
                          >
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setMobileOpen(false)}
                              className={cn(
                                isMobileDashboard
                                  ? "relative flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all duration-200 active:scale-[0.98] w-full group gap-2 h-[105px]"
                                  : "relative flex items-center gap-3.5 p-3 rounded-xl border text-left transition-all duration-200 active:scale-[0.98] w-full group",
                                isActive
                                  ? "bg-sigma-600/10 border-sigma-500/40 text-white font-semibold shadow-md shadow-sigma-500/5"
                                  : "bg-gray-900/40 border-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-800/30 hover:border-gray-700/50 hover:translate-x-1"
                              )}
                            >
                              <div className={cn(
                                isMobileDashboard
                                  ? "w-10 h-10 rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
                                  : "w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0",
                                isActive ? "bg-sigma-500 text-white" : "bg-gray-800 text-gray-400 group-hover:text-white"
                              )}>
                                <IconComponent className={cn(isMobileDashboard ? "w-5 h-5" : "w-4 h-4")} />
                              </div>
                              <div className={isMobileDashboard ? "min-w-0" : "flex-1 min-w-0 pr-6"}>
                                <span className={cn(
                                  "text-xs leading-snug font-medium block text-white",
                                  isMobileDashboard ? "text-center line-clamp-2 text-[11px]" : ""
                                )}>{item.label}</span>
                              </div>
                              {item.badge != null && item.badge > 0 && (
                                <span className={cn(
                                  "absolute bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0",
                                  isMobileDashboard ? "top-2 right-2" : "right-3"
                                )}>
                                  {item.badge}
                                </span>
                              )}
                            </Link>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Rodapé do Menu */}
              <div className="pt-3 border-t border-gray-800/80 flex items-center gap-2 flex-shrink-0">
                <Link
                  href="/perfil"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 flex items-center gap-2.5 p-1.5 bg-gray-900/30 border border-gray-800/80 rounded-xl text-left"
                >
                  <div className="w-7 h-7 bg-sigma-600/20 border border-sigma-500/20 rounded-lg flex items-center justify-center flex-shrink-0 text-sigma-400 text-[10px] font-bold">
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[10px] font-medium truncate">{user.name}</p>
                    <p className="text-gray-500 text-[8px] truncate">{user.role?.replace('_', ' ')}</p>
                  </div>
                </Link>
                <button
                  onClick={async () => { await signOut({ redirect: false }); window.location.href = '/login'; }}
                  className="w-8 h-8 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center justify-center active:scale-95 transition"
                  title="Sair"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    <motion.aside
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={cn(
        "hidden md:flex flex-col bg-gray-900 border-r border-gray-800 overflow-hidden flex-shrink-0 z-50 md:relative"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
        <div className="flex items-center justify-center flex-shrink-0" style={{ width: logoSize, height: logoSize }}>
          <Image
            src="/logos/badge-aip.png"
            alt="AIP"
            width={64}
            height={64}
            className="object-contain"
            style={{ width: logoSize, height: logoSize }}
          />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-w-0"
            >
              <div className="flex items-center gap-1.5">
                <p className="text-white font-bold text-sm leading-tight">SIAIP</p>
              </div>
              <p className="text-gray-400 text-xs leading-tight">Sistema Integrado da Agência de Inteligência Penal</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => (
          <div key={item.href}>
            <SidebarItem item={item} pathname={pathname} collapsed={collapsed} />
            {item.href === '/chat' && !collapsed && chatChannels.length > 0 && pathname !== '/chat' && (
              <div className="ml-4 mt-0.5 mb-0.5 space-y-0.5 border-l border-gray-700/60 pl-2">
                {chatChannels.map((ch) => (
                  <Link
                    key={ch.id}
                    href="/chat"
                    className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    <span className="flex-1 truncate">{ch.name}</span>
                    <span className="text-red-400 font-medium tabular-nums">{ch.unread > 99 ? '99+' : ch.unread}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {filteredAdmin.length > 0 && (
          <>
            <div className="pt-4 pb-2">
              {!collapsed && (
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-3">
                  Administração
                </p>
              )}
              {collapsed && <div className="border-t border-gray-800 my-2" />}
            </div>
            {filteredAdmin.map((item) => (
              <SidebarItem key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
            ))}
          </>
        )}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-gray-800">
        <Link
          href="/perfil"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Meu Perfil' : undefined}
        >
          <div className="w-8 h-8 bg-sigma-600/30 border border-sigma-500/30 rounded-lg flex items-center justify-center flex-shrink-0 text-sigma-400 text-xs font-bold">
            {user.name?.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user.name}</p>
              <p className="text-gray-500 text-xs truncate">{user.role?.replace('_', ' ')}</p>
            </div>
          )}
          {!collapsed && <UserCircle className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />}
        </Link>
        <button
          onClick={async () => { await signOut({ redirect: false }); window.location.href = '/login'; }}
          className={cn(
            'mt-1 flex items-center gap-2 px-3 py-2 rounded-lg w-full text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors text-sm',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>

      {/* Botão fechar — só no mobile */}
      <button
        onClick={() => setMobileOpen(false)}
        className="md:hidden absolute top-3 right-3 w-9 h-9 bg-gray-800 text-gray-400 hover:text-white rounded-lg flex items-center justify-center"
        aria-label="Fechar menu"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Collapse button — só no desktop */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden md:flex absolute top-1/2 -right-3 w-6 h-6 bg-gray-700 border border-gray-600 rounded-full items-center justify-center text-gray-400 hover:text-white hover:bg-gray-600 transition-colors z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </motion.aside>

    {/* Banner de Notificação de Ordem de Missão Mobile/Desktop de Fácil Aceite */}
    <AnimatePresence>
      {ordemPendente > 0 && latestOrdem && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[420px] bg-gradient-to-br from-slate-900 to-slate-950 border border-amber-500/40 text-white rounded-3xl p-5 shadow-2xl z-50 flex flex-col gap-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 animate-pulse">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-400 tracking-wide">🎯 ORDEM DE MISSÃO ATIVA</h4>
                <p className="text-[11px] text-slate-400 font-medium">Ciência obrigatória requerida</p>
              </div>
            </div>
            <span className="text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Pendente
            </span>
          </div>

          <div className="bg-slate-800/40 border border-slate-800 p-3 rounded-2xl">
            <p className="text-xs font-mono font-bold text-slate-200">{latestOrdem.numero}</p>
            <p className="text-xs text-slate-300 mt-1 font-medium line-clamp-2">{latestOrdem.titulo}</p>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => handleDarCiencia(latestOrdem.id)}
              disabled={givingCiencia}
              className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-800 disabled:to-slate-800 text-white rounded-2xl py-3 px-4 text-xs font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {givingCiencia ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>REGISTRANDO...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>DAR CIÊNCIA (ACEITAR)</span>
                </>
              )}
            </button>
            <Link
              href="/ordens-missao"
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-xs font-semibold transition-colors active:scale-95 text-center whitespace-nowrap cursor-pointer border border-slate-700/50"
            >
              VER MAIS
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

function SidebarItem({ item, pathname, collapsed }: { item: any; pathname: string; collapsed: boolean }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
  const IconComponent = iconMap[item.iconName] || FileText;

  return (
    <Link
      href={item.href}
      className={cn(
        'sidebar-item',
        isActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
        collapsed && 'justify-center px-2',
        item.badgePulse && !isActive && 'ring-1 ring-red-500/40'
      )}
      title={collapsed ? item.label : undefined}
    >
      <IconComponent className="w-4 h-4 flex-shrink-0" />
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {item.badge != null && item.badge > 0 && (
        <span className={cn(
          'text-white text-xs px-1.5 py-0.5 rounded-full',
          collapsed ? 'absolute top-1 right-1 px-1 min-w-[16px] text-center' : '',
          item.badgePulse ? 'bg-red-500 animate-pulse' : 'bg-sigma-500'
        )}>
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  );
}
