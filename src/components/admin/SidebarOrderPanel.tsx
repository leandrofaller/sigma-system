'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ArrowDown, Save, Loader2, RefreshCw, CheckCircle, Navigation, Shield } from 'lucide-react';
import { defaultNavItems, defaultAdminItems, iconMap, sortItems, NavItem } from '../layout/Sidebar';

interface Props {
  configs: Record<string, any>;
}

export function SidebarOrderPanel({ configs }: Props) {
  const sidebarOrder = configs.sidebar_order as { nav?: string[]; admin?: string[] } | undefined;

  const [navItems, setNavItems] = useState<NavItem[]>(() =>
    sortItems(defaultNavItems, sidebarOrder?.nav ?? [])
  );
  const [adminItems, setAdminItems] = useState<NavItem[]>(() =>
    sortItems(defaultAdminItems, sidebarOrder?.admin ?? [])
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const moveItem = (
    type: 'nav' | 'admin',
    index: number,
    direction: 'up' | 'down'
  ) => {
    const list = type === 'nav' ? [...navItems] : [...adminItems];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= list.length) return;

    // Swap items
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    if (type === 'nav') {
      setNavItems(list);
    } else {
      setAdminItems(list);
    }
  };

  const handleReset = () => {
    if (confirm('Deseja restaurar a ordem padrão das abas?')) {
      setNavItems([...defaultNavItems]);
      setAdminItems([...defaultAdminItems]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const order = {
        nav: navItems.map((item) => item.href),
        admin: adminItems.map((item) => item.href),
      };

      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sidebar_order: order }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        alert('Erro ao salvar ordenação.');
      }
    } catch {
      alert('Erro de rede ao salvar ordenação.');
    } finally {
      setSaving(false);
    }
  };

  const renderList = (type: 'nav' | 'admin', items: NavItem[]) => {
    return (
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((item, index) => {
            const Icon = iconMap[item.iconName] || Navigation;
            return (
              <motion.div
                key={item.href}
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="flex items-center justify-between p-3 bg-gray-900/40 border border-gray-800/60 rounded-xl hover:border-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 flex-shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-white block truncate">
                      {item.label}
                    </span>
                    <span className="text-[10px] text-gray-500 block truncate">
                      {item.href}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveItem(type, index, 'up')}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-white text-gray-400 transition-colors disabled:opacity-30 disabled:hover:bg-gray-800/60 disabled:hover:text-gray-400"
                    title="Mover para cima"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveItem(type, index, 'down')}
                    disabled={index === items.length - 1}
                    className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-white text-gray-400 transition-colors disabled:opacity-30 disabled:hover:bg-gray-800/60 disabled:hover:text-gray-400"
                    title="Mover para baixo"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-800/80">
          <div>
            <h3 className="font-semibold text-white">Ordenação do Menu Lateral</h3>
            <p className="text-xs text-gray-400 mt-1">
              Reordene os itens que aparecem nas barras laterais de navegação e administração.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 text-xs font-medium border border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white px-3 py-2 rounded-xl transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restaurar Padrão
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 text-xs font-medium bg-sigma-600 hover:bg-sigma-500 disabled:bg-sigma-700 text-white px-4 py-2 rounded-xl transition-colors shadow-lg shadow-sigma-600/10"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : saved ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-200" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar Ordenação'}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1 text-gray-400 font-medium">
              <Navigation className="w-4 h-4 text-sigma-500" />
              <span className="text-sm font-semibold">Menu Principal (Navegação)</span>
            </div>
            {renderList('nav', navItems)}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1 text-gray-400 font-medium">
              <Shield className="w-4 h-4 text-sigma-500" />
              <span className="text-sm font-semibold">Menu Administrativo</span>
            </div>
            {renderList('admin', adminItems)}
          </div>
        </div>
      </div>
    </div>
  );
}
