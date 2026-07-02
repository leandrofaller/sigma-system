'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Save, 
  ArrowUp, 
  ArrowDown, 
  Eye, 
  EyeOff, 
  Shield, 
  Settings, 
  Loader2, 
  RefreshCw,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Mapeamento dos ícones da Lucide importados estaticamente para fins de renderização
import {
  LayoutDashboard, FileText, Inbox, BookOpen, ClipboardList, Calendar, CalendarDays,
  Trello, MessageSquare, Sparkles, UserCheck, Shield as ShieldIcon, Database, Smartphone, Brain, Building2,
  Users, FolderOpen, Monitor, MapPin, AlertCircle, Briefcase
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<any>> = {
  LayoutDashboard, FileText, Inbox, BookOpen, ClipboardList, Calendar, CalendarDays,
  Trello, MessageSquare, Sparkles, UserCheck, Shield: ShieldIcon, Database, Smartphone, Brain, Building2,
  Users, FolderOpen, Monitor, MapPin, AlertCircle, Settings, Briefcase
};

interface SidebarItemConfig {
  id: string;
  key: string;
  label: string;
  href: string;
  iconName: string;
  position: number;
  roles: string[];
  enabled: boolean;
  isAdmin: boolean;
}

export function SidebarConfigManager() {
  const router = useRouter();
  const [items, setItems] = useState<SidebarItemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Carrega as abas do backend
  const loadConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sidebar');
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      } else {
        alert('Erro ao carregar configurações de navegação.');
      }
    } catch {
      alert('Erro de conexão ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  // Reordenação local: move o item para cima ou para baixo
  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newItems.length) return;

    // Apenas permitir reordenar dentro da mesma seção (navItems com navItems, e adminItems com adminItems)
    if (newItems[index].isAdmin !== newItems[targetIndex].isAdmin) return;

    // Troca de posição
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    // Recalcula as posições em lote (incrementos de 10)
    const updatedWithPositions = newItems.map((item, idx) => ({
      ...item,
      position: (idx + 1) * 10
    }));

    setItems(updatedWithPositions);
  };

  // Toggle do campo Enabled
  const handleToggleEnabled = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
    );
  };

  // Toggle de Roles (Permissões de uso)
  const handleToggleRole = (id: string, role: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const roles = item.roles.includes(role)
          ? item.roles.filter((r) => r !== role)
          : [...item.roles, role];
        return { ...item, roles };
      })
    );
  };

  // Alterar Label (Renomear)
  const handleLabelChange = (id: string, newLabel: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, label: newLabel } : item))
    );
  };

  // Grava as alterações no backend
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/sidebar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (res.ok) {
        const updatedData = await res.json();
        setItems(updatedData);
        alert('Configurações da barra lateral salvas com sucesso!');
        // Recarrega a sidebar dinamicamente nas páginas
        router.refresh();
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao salvar configurações');
      }
    } catch (err: any) {
      alert(err.message || 'Ocorreu um erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  // Divide as abas em categorias
  const navItems = items.filter((item) => !item.isAdmin);
  const adminItems = items.filter((item) => item.isAdmin);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-sigma-600 animate-spin" />
        <span className="text-sm font-medium text-subtle">Carregando mapa de navegação...</span>
      </div>
    );
  }

  const renderSectionList = (sectionItems: SidebarItemConfig[], title: string, subtitle: string) => {
    return (
      <div className="space-y-4">
        <div className="border-b border-gray-100 dark:border-gray-800 pb-2">
          <h2 className="text-sm font-bold text-title uppercase tracking-wider">{title}</h2>
          <p className="text-xs text-subtle">{subtitle}</p>
        </div>

        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {sectionItems.map((item, idx) => {
              // Encontra o index absoluto no array completo de items
              const absoluteIdx = items.findIndex((x) => x.id === item.id);
              const IconComponent = iconMap[item.iconName] || FileText;

              const isFirst = idx === 0;
              const isLast = idx === sectionItems.length - 1;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className={`card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border transition-all ${
                    item.enabled 
                      ? 'border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50' 
                      : 'border-dashed border-gray-200 dark:border-gray-800 opacity-60 bg-gray-50/50 dark:bg-gray-800/10'
                  }`}
                >
                  {/* Esquerda: Ícone + Rename + Link */}
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`p-2.5 rounded-xl border shrink-0 ${
                      item.enabled 
                        ? 'bg-sigma-500/10 border-sigma-500/20 text-sigma-500' 
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-subtle'
                    }`}>
                      <IconComponent className="w-5 h-5" />
                    </div>

                    <div className="flex-1 space-y-1">
                      <input 
                        type="text" 
                        value={item.label}
                        onChange={(e) => handleLabelChange(item.id, e.target.value)}
                        className="bg-transparent font-bold text-title text-sm border-0 border-b border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-sigma-500 focus:ring-0 p-0 py-0.5 w-full md:max-w-xs transition-colors"
                        placeholder="Nome da Aba"
                      />
                      <span className="block text-[10px] font-mono text-subtle leading-none">
                        Rota: {item.href}
                      </span>
                    </div>
                  </div>

                  {/* Centro: Controle de Posição & Toggles */}
                  <div className="flex flex-wrap items-center gap-6">
                    {/* Botões de Posição */}
                    <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 rounded-xl p-1 shrink-0">
                      <button
                        onClick={() => handleMove(absoluteIdx, 'up')}
                        disabled={isFirst}
                        className="p-1.5 rounded-lg text-subtle hover:text-title hover:bg-white dark:hover:bg-gray-700 transition disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Mover para cima"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
                      <button
                        onClick={() => handleMove(absoluteIdx, 'down')}
                        disabled={isLast}
                        className="p-1.5 rounded-lg text-subtle hover:text-title hover:bg-white dark:hover:bg-gray-700 transition disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Habilitado (Visualização) */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleEnabled(item.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                          item.enabled 
                            ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400' 
                            : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {item.enabled ? (
                          <>
                            <Eye className="w-3.5 h-3.5" /> Habilitado
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" /> Desabilitado
                          </>
                        )}
                      </button>
                    </div>

                    {/* Roles (Permissões de uso) */}
                    <div className="flex items-center gap-1.5">
                      {['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].map((r) => {
                        const isAllowed = item.roles.includes(r);
                        return (
                          <button
                            key={r}
                            onClick={() => handleToggleRole(item.id, r)}
                            className={`px-2 py-1 rounded-lg text-[9px] font-black border transition-all ${
                              isAllowed 
                                ? 'bg-sigma-600/10 border-sigma-500/30 text-white' 
                                : 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 text-subtle hover:bg-gray-100 dark:hover:bg-gray-800/80'
                            }`}
                            title={`Alternar acesso de ${r}`}
                          >
                            {r.replace('SUPER_ADMIN', 'S.ADMIN').replace('OPERATOR', 'OPERADOR')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner Informações */}
      <div className="card p-4 bg-blue-500/5 border-l-4 border-l-blue-500 flex gap-3 text-xs leading-relaxed text-body shadow-xs">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-title block mb-0.5">Painel de Gerenciamento da Navegação</span>
          Aqui você pode renomear as abas, reordenar a barra lateral e habilitar ou desabilitar o acesso individual de cada aba para as diferentes roles do sistema. Pressione <strong>Salvar Alterações</strong> no rodapé para persistir as modificações.
        </div>
      </div>

      {/* Editor Content */}
      <div className="space-y-8">
        {renderSectionList(
          navItems, 
          'Menu Principal', 
          'Abas comuns de rotinas de inteligência e acompanhamento operacional'
        )}

        {renderSectionList(
          adminItems, 
          'Menu de Administração', 
          'Abas exclusivas de gerenciamento técnico do sistema, auditoria e backups'
        )}
      </div>

      {/* Footer Bar fixado com Ações */}
      <div className="fixed bottom-0 left-0 md:left-64 right-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between z-40 transition-all duration-200">
        <span className="text-[10px] text-subtle font-mono uppercase tracking-wider">
          {items.length} abas configuradas
        </span>
        <div className="flex items-center gap-2">
          <button 
            onClick={loadConfigs} 
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-bold text-body border border-gray-200 dark:border-gray-800 px-4 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Descartar
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-sigma-600 hover:bg-sigma-700 px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 shadow-md shadow-sigma-500/10"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
}
