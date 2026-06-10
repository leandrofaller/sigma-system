'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Activity, Calendar, MapPin, Users, ChevronRight, ClipboardCheck, Search, X, MessageSquare, ListTodo } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DeleteMissionButton } from './DeleteMissionButton';
import { containsNormalized } from '@/lib/search';

interface Mission {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate?: string | null;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  user: { name: string | null };
  group?: { name: string; color?: string | null } | null;
  totalCards: number;
  totalComments: number;
}

interface Props {
  initialMissions: Mission[];
  isAdmin: boolean;
}

export function MobileAcompanhamentoView({ initialMissions, isAdmin }: Props) {
  const [activeTab, setActiveTab] = useState<'in_progress' | 'planned' | 'completed' | 'cancelled' | 'all'>('in_progress');
  const [searchQuery, setSearchQuery] = useState('');

  const inProgressTotal = initialMissions.filter(m => m.status === 'IN_PROGRESS').length;
  const plannedTotal = initialMissions.filter(m => m.status === 'PLANNED').length;
  const completedTotal = initialMissions.filter(m => m.status === 'COMPLETED').length;
  const cancelledTotal = initialMissions.filter(m => m.status === 'CANCELLED').length;
  const allTotal = initialMissions.length;

  const filteredMissions = initialMissions.filter(m => {
    const matchesSearch =
      containsNormalized(m.title, searchQuery) ||
      containsNormalized(m.destination, searchQuery);

    if (!matchesSearch) return false;

    if (activeTab === 'in_progress') return m.status === 'IN_PROGRESS';
    if (activeTab === 'planned') return m.status === 'PLANNED';
    if (activeTab === 'completed') return m.status === 'COMPLETED';
    if (activeTab === 'cancelled') return m.status === 'CANCELLED';
    return true; // 'all'
  });

  return (
    <div
      className="-mx-3 md:-mx-6 -my-3 md:-my-6 bg-gray-50 dark:bg-gray-950 flex flex-col min-h-screen"
      style={{ paddingBottom: 'max(6rem, calc(4rem + env(safe-area-inset-bottom)))' }}
    >
      {/* Header */}
      <div
        className="bg-gradient-to-br from-sigma-600 to-sigma-800 text-white px-4 pb-5 rounded-b-3xl shadow-lg flex-shrink-0"
        style={{ paddingTop: 'max(1.25rem, calc(env(safe-area-inset-top) + 1rem))' }}
      >
        <div className="pl-12 md:pl-0">
          <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wider">Monitoramento</p>
          <h1 className="text-xl sm:text-2xl font-bold">Acompanhamento</h1>
        </div>
      </div>

      <div className="px-3 sm:px-4 pt-4 space-y-4 flex-1">
        {/* Barra de Busca */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por título ou destino..."
            className="w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl pl-10 pr-4 py-3 text-sm placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-sigma-500 text-title shadow-sm"
          />
          <Search className="w-4.5 h-4.5 text-subtle absolute left-3.5 top-1/2 -translate-y-1/2" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle p-1 hover:text-title active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Barra de Abas (Tabs) */}
        <div className="flex bg-white dark:bg-gray-900 p-1 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm gap-0.5 overflow-x-auto scrollbar-none">
          {[
            { id: 'in_progress', label: 'Em Curso', count: inProgressTotal, color: 'bg-orange-500' },
            { id: 'planned', label: 'Planejadas', count: plannedTotal, color: 'bg-sigma-600' },
            { id: 'completed', label: 'Concluídas', count: completedTotal, color: 'bg-green-600' },
            { id: 'cancelled', label: 'Canceladas', count: cancelledTotal, color: 'bg-red-500' },
            { id: 'all', label: 'Todas', count: allTotal, color: 'bg-gray-500' }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative flex-1 min-w-[70px] py-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center min-h-[46px] ${
                  isActive ? 'text-white' : 'text-subtle active:bg-gray-100 dark:active:bg-gray-800'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicatorAcomp"
                    className={`absolute inset-0 rounded-xl ${tab.color}`}
                    transition={{ type: 'spring', duration: 0.38 }}
                  />
                )}
                <span className="relative z-10 font-bold">{tab.label}</span>
                <span className={`relative z-10 text-[9px] px-1.5 py-0.2 rounded-full mt-0.5 font-bold ${
                  isActive ? 'bg-white/25 text-white' : 'bg-gray-100 dark:bg-gray-800 text-subtle'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Listagem com animações */}
        <motion.div layout className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredMissions.map((m, idx) => {
              const isCancelled = m.status === 'CANCELLED';
              const isCompleted = m.status === 'COMPLETED';
              
              const borderColors = {
                PLANNED: 'border-l-blue-400',
                IN_PROGRESS: 'border-l-orange-500',
                COMPLETED: 'border-l-green-500',
                CANCELLED: 'border-l-red-500'
              };

              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: Math.min(idx * 0.04, 0.2) }}
                  layout
                  className="relative group/card"
                >
                  {isAdmin && (
                    <div className="absolute top-3.5 right-10 z-10 active:scale-90 transition-transform">
                      <DeleteMissionButton missionId={m.id} />
                    </div>
                  )}
                  <Link
                    href={`/missoes/${m.id}/quadro`}
                    className={`block bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 border-l-4 ${borderColors[m.status]} p-4 shadow-sm active:scale-[0.99] transition-transform`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 pr-8">
                        <h3 className="font-bold text-title text-sm truncate leading-snug">{m.title}</h3>
                        <p className="text-xs text-subtle mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{m.destination}</span>
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-subtle flex-shrink-0 mt-0.5" />
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-subtle mt-3.5 pt-2.5 border-t border-gray-50 dark:border-gray-800/80">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(m.startDate), "dd MMM", { locale: ptBR })}
                      </span>
                      {m.group && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.group.color || '#6172f3' }} />
                          {m.group.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1 ml-auto">
                        <Users className="w-3 h-3" /> {m.user.name?.split(' ')[0]}
                      </span>
                    </div>

                    {(m.totalCards > 0 || m.totalComments > 0) && (
                      <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-dashed border-gray-100 dark:border-gray-800/50 text-[10px]">
                        {m.totalCards > 0 && (
                          <span className="text-body font-bold flex items-center gap-1">
                            <ListTodo className="w-3 h-3 text-sigma-600" />
                            {m.totalCards} card{m.totalCards !== 1 ? 's' : ''}
                          </span>
                        )}
                        {m.totalComments > 0 && (
                          <span className="text-subtle flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {m.totalComments} coment.
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filteredMissions.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 px-4 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm"
            >
              <div className="w-16 h-16 mx-auto bg-sigma-50 dark:bg-sigma-900/30 rounded-2xl flex items-center justify-center mb-3">
                <ClipboardCheck className="w-8 h-8 text-sigma-600" />
              </div>
              <h3 className="text-sm font-bold text-title">Nenhuma missão para acompanhar</h3>
              <p className="text-xs text-subtle mt-1">
                {searchQuery ? 'Tente ajustar os termos da busca.' : 'Não há missões cadastradas nesta categoria.'}
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
