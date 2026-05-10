'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FileText, Inbox, MessageSquare, Sparkles,
  Users, Settings, ClipboardList, ChevronLeft,
  ChevronRight, Package, LogOut, FolderOpen, UserCircle, MapPin, Database, BookOpen
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import type { SessionUser } from '@/types';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<any>;
  roles?: string[];
  badge?: number;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Relatórios (RELINTs)', href: '/relints', icon: FileText },
  { label: 'RELINTs Recebidos', href: '/relints-recebidos', icon: Inbox, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Debriefings', href: '/debriefings', icon: BookOpen },
  { label: 'Chat Interno', href: '/chat', icon: MessageSquare },
  { label: 'Consulta IA', href: '/ia', icon: Sparkles },
];

const adminItems: NavItem[] = [
  { label: 'Usuários', href: '/admin/usuarios', icon: Users },
  { label: 'Grupos / Setores', href: '/admin/grupos', icon: FolderOpen, roles: ['SUPER_ADMIN'] },
  { label: 'Monitoramento', href: '/admin/monitoramento', icon: MapPin, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Auditoria', href: '/auditoria', icon: ClipboardList },
  { label: 'Backups', href: '/admin/backups', icon: Database, roles: ['SUPER_ADMIN'] },
  { label: 'Configurações', href: '/admin/configuracoes', icon: Settings, roles: ['SUPER_ADMIN'] },
];

interface SidebarProps {
  user: SessionUser;
  logoSize?: number;
}

export function Sidebar({ user, logoSize = 36 }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const filteredNav = navItems.filter(
    (item) => !item.roles || item.roles.includes(user?.role ?? '')
  );
  const filteredAdmin = adminItems.filter(
    (item) => (!item.roles || item.roles.includes(user?.role ?? '')) && isAdmin
  );

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="relative flex flex-col bg-gray-900 border-r border-gray-800 overflow-hidden flex-shrink-0"
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-white font-bold text-sm leading-tight">SIAIP</p>
              <p className="text-gray-400 text-xs leading-tight">Sistema Integrado da Agência de Inteligência Penal</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => (
          <SidebarItem key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
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

      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute top-1/2 -right-3 w-6 h-6 bg-gray-700 border border-gray-600 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-600 transition-colors z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </motion.aside>
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
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {!collapsed && item.badge && (
        <span className="bg-sigma-500 text-white text-xs px-1.5 py-0.5 rounded-full">
          {item.badge}
        </span>
      )}
    </Link>
  );
}
