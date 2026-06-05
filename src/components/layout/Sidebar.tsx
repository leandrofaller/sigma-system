'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FileText, Inbox, MessageSquare, Sparkles,
  Users, Settings, ClipboardList, ChevronLeft,
  ChevronRight, Package, LogOut, FolderOpen, UserCircle, MapPin, Database, BookOpen, Calendar, Menu, X, Trello, Smartphone, UserCheck, Monitor, Shield, Brain, AlertCircle, CalendarDays
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import type { SessionUser } from '@/types';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<any>;
  roles?: string[];
  badge?: number;
  badgePulse?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Relatórios (RELINTs)', href: '/relints', icon: FileText },
  { label: 'RELINTs Recebidos', href: '/relints-recebidos', icon: Inbox, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Debriefings', href: '/debriefings', icon: BookOpen },
  { label: 'Calendário de Missões', href: '/missoes', icon: Calendar },
  { label: 'Mural de Eventos', href: '/mural', icon: CalendarDays },
  { label: 'Acompanhamento', href: '/acompanhamento', icon: Trello },
  { label: 'Chat Interno', href: '/chat', icon: MessageSquare },
  { label: 'Consulta IA', href: '/ia', icon: Sparkles },
  { label: 'Identificação de Apenados', href: '/apenados', icon: UserCheck },
  { label: 'Apenados & Facções', href: '/faccoes', icon: Shield, roles: ['SUPER_ADMIN'] },
  { label: 'SIAIP', href: '/siaip', icon: Database, roles: ['SUPER_ADMIN'] },
  { label: 'AIP', href: '/aip', icon: Brain, roles: ['SUPER_ADMIN', 'OPERATOR'] },
];

const baseAdminItems: NavItem[] = [
  { label: 'Usuários', href: '/admin/usuarios', icon: Users },
  { label: 'Grupos / Setores', href: '/admin/grupos', icon: FolderOpen, roles: ['SUPER_ADMIN'] },
  { label: 'Dispositivos', href: '/admin/dispositivos', icon: Monitor },
  { label: 'Monitoramento', href: '/admin/monitoramento', icon: MapPin, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Avisos de Manutenção', href: '/admin/manutencao', icon: AlertCircle, roles: ['SUPER_ADMIN'] },
  { label: 'Auditoria', href: '/auditoria', icon: ClipboardList },
  { label: 'Backups', href: '/admin/backups', icon: Database, roles: ['SUPER_ADMIN'] },
  { label: 'Configurações', href: '/admin/configuracoes', icon: Settings, roles: ['SUPER_ADMIN'] },
];

interface SidebarProps {
  user: SessionUser;
  logoSize?: number;
  pendingDeviceCount?: number;
}

interface ChatChannel {
  type: 'direct' | 'group';
  id: string;
  name: string;
  unread: number;
}

export function Sidebar({ user, logoSize = 36, pendingDeviceCount = 0 }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>([]);
  const [isMobileDashboard, setIsMobileDashboard] = useState(false);
  const prevCountRef = useRef(0);
  const pathname = usePathname();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

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

  const adminItems = baseAdminItems.map((item) =>
    item.href === '/admin/dispositivos' && pendingDeviceCount > 0
      ? { ...item, badge: pendingDeviceCount }
      : item
  );

  const filteredNav = navItems
    .filter((item) => !item.roles || item.roles.includes(user?.role ?? ''))
    .map((item) =>
      item.href === '/chat' && chatUnreadCount > 0
        ? { ...item, badge: chatUnreadCount, badgePulse: true }
        : item
    );
  const filteredAdmin = adminItems.filter(
    (item) => (!item.roles || item.roles.includes(user?.role ?? '')) && isAdmin
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
                            <item.icon className={cn(isMobileDashboard ? "w-5 h-5" : "w-4 h-4")} />
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
                                <item.icon className={cn(isMobileDashboard ? "w-5 h-5" : "w-4 h-4")} />
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
    </>
  );
}

function SidebarItem({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

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
      <item.icon className="w-4 h-4 flex-shrink-0" />
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
