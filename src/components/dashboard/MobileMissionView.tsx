'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parsePortugueseFloat } from '@/lib/utils';
import { containsNormalizedText } from '@/lib/search';
import {
  Plus, MapPin, Clock, CheckCircle2, X, Loader2,
  Navigation, Zap, Monitor, Pencil, AlertTriangle,
  Calendar as CalendarIcon, Gauge, FileBarChart, Flag, Search,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Mission {
  id: string;
  title: string;
  description?: string | null;
  destination: string;
  startDate: string;
  endDate?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  endNote?: string | null;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  userId: string;
  groupId?: string | null;
  group?: { id: string; name: string; color?: string | null } | null;
  participants: string[];
  startKm?: number | null;
  endKm?: number | null;
  placa?: string | null;
}

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isScheduledDateReached(scheduledISO: string): boolean {
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const sch = new Date(scheduledISO);
  const s = new Date(sch.getFullYear(), sch.getMonth(), sch.getDate());
  return t.getTime() >= s.getTime();
}

const AVAILABLE_PARTICIPANTS = [
  'GEAN', 'JAQUELINE', 'JEFFERSON', 'JORDANIO',
  'SIQUEIRA', 'FALLER', 'RAFAEL', 'SIDNEI',
  'STAUSTON', 'VALTEIR',
];

interface Props {
  initialMissions: Mission[];
  groups: { id: string; name: string; color?: string | null }[];
  currentUser: { id: string; name: string; groupId?: string | null };
}

const STATUS_LABEL: Record<Mission['status'], string> = {
  PLANNED: 'Planejada',
  IN_PROGRESS: 'Em Curso',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export function MobileMissionView({ initialMissions, groups, currentUser }: Props) {
  // Filtra cancelladas — não devem poluir o dashboard mobile
  const [missions, setMissions] = useState<Mission[]>(
    initialMissions.filter(m => m.status !== 'CANCELLED')
  );
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Modais de transição
  const [startingMission, setStartingMission] = useState<Mission | null>(null);
  const [startKmValue, setStartKmValue] = useState('');
  const [placaValue, setPlacaValue] = useState('');
  const [endingMission, setEndingMission] = useState<Mission | null>(null);
  const [endKmValue, setEndKmValue] = useState('');
  const [endNoteValue, setEndNoteValue] = useState('');
  const [confirmCancelMission, setConfirmCancelMission] = useState<Mission | null>(null);

  const [form, setForm] = useState({
    title: '',
    destination: '',
    startDate: todayDateStr(),  // input type="date"
    startKm: '',                 // só usado se startNow
    participants: [] as string[],
    description: '',
    endDate: '',
    groupId: currentUser.groupId || '',
    startNow: false,
  });

  const [activeTab, setActiveTab] = useState<'all' | 'in_progress' | 'planned' | 'completed'>('in_progress');
  const [searchQuery, setSearchQuery] = useState('');

  const inProgressTotal = missions.filter(m => m.status === 'IN_PROGRESS').length;
  const plannedTotal = missions.filter(m => m.status === 'PLANNED').length;
  const completedTotal = missions.filter(m => m.status === 'COMPLETED').length;
  const allTotal = missions.length;

  const filteredMissions = missions.filter(m => {
    const matchesSearch = 
      containsNormalizedText(m.title, searchQuery) ||
      containsNormalizedText(m.destination, searchQuery) ||
      (m.participants && m.participants.some(p => containsNormalizedText(p, searchQuery)));
      
    if (!matchesSearch) return false;
    
    if (activeTab === 'in_progress') return m.status === 'IN_PROGRESS';
    if (activeTab === 'planned') return m.status === 'PLANNED';
    if (activeTab === 'completed') return m.status === 'COMPLETED';
    return true; // 'all'
  });

  const resetForm = () => {
    setForm({
      title: '', destination: '', startDate: todayDateStr(), startKm: '',
      participants: [], description: '', endDate: '',
      groupId: currentUser.groupId || '', startNow: false,
    });
    setEditingId(null);
  };

  const openEdit = (m: Mission) => {
    setForm({
      title: m.title,
      destination: m.destination,
      startDate: m.startDate.slice(0, 10),
      startKm: '',
      participants: m.participants || [],
      description: m.description || '',
      endDate: m.endDate ? m.endDate.slice(0, 16) : '',
      groupId: m.groupId || currentUser.groupId || '',
      startNow: false,
    });
    setEditingId(m.id);
    setShowForm(true);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalização não suportada neste dispositivo');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=pt-BR`
          );
          const data = await res.json();
          const addr = data.address || {};
          const city = addr.city || addr.town || addr.village || addr.municipality || '';
          const state = addr.state_code || addr.state || '';
          const label = [city, state].filter(Boolean).join(' / ') ||
            data.display_name?.split(',').slice(0, 2).join(',') ||
            `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
          setForm(f => ({ ...f, destination: label }));
          toast.success('Localização preenchida');
        } catch {
          setForm(f => ({ ...f, destination: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}` }));
          toast.success('Coordenadas preenchidas');
        } finally {
          setGpsLoading(false);
        }
      },
      err => {
        setGpsLoading(false);
        toast.error(err.code === err.PERMISSION_DENIED ? 'Permissão de localização negada' : 'Não foi possível obter a localização');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const toggleParticipant = (name: string) => {
    setForm(f => ({
      ...f,
      participants: f.participants.includes(name)
        ? f.participants.filter(p => p !== name)
        : [...f.participants, name],
    }));
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.title.trim() || !form.destination.trim()) {
      toast.error('Preencha título e destino');
      return;
    }
    if (form.startNow && !form.startKm) {
      toast.error('Informe o KM inicial para iniciar agora');
      return;
    }
    setLoading(true);
    try {
      // EDIÇÃO de agendamento existente (PLANNED)
      if (editingId) {
        const res = await fetch(`/api/missions/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            description: form.description || null,
            destination: form.destination,
            startDate: form.startDate,
            endDate: form.endDate || null,
            groupId: form.groupId || null,
            participants: form.participants,
          }),
        });
        if (!res.ok) {
          const e = await res.json();
          throw new Error(e.error || 'Erro ao atualizar');
        }
        const updated = await res.json();
        setMissions(prev => prev.map(m => m.id === editingId ? { ...m, ...updated } : m));
        toast.success('Agendamento atualizado!');
        resetForm();
        setShowForm(false);
        return;
      }

      // CRIAÇÃO de nova missão
      const payload: any = {
        title: form.title,
        description: form.description || undefined,
        destination: form.destination,
        startDate: form.startNow ? new Date().toISOString() : form.startDate,
        endDate: form.endDate || undefined,
        groupId: form.groupId || undefined,
        participants: form.participants,
      };
      if (form.startNow) {
        payload.startNow = true;
        payload.startKm = parsePortugueseFloat(form.startKm);
      }

      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erro ao registrar viagem');
      }
      const newMission = await res.json();
      setMissions([newMission, ...missions]);
      toast.success(form.startNow ? 'Viagem iniciada!' : 'Viagem registrada!');

      resetForm();
      setShowForm(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const requestStart = (m: Mission) => {
    if (!isScheduledDateReached(m.startDate)) {
      toast.error('Esta missão está agendada para data futura — disponível só a partir do dia previsto.');
      return;
    }
    setStartingMission(m);
    setStartKmValue('');
    setPlacaValue('');
  };

  const confirmStart = async () => {
    if (!startingMission) return;
    if (!placaValue.trim()) { toast.error('Informe a placa do veículo'); return; }
    if (!startKmValue) { toast.error('Informe o KM inicial'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/missions/${startingMission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS', startKm: parsePortugueseFloat(startKmValue), placa: placaValue.trim().toUpperCase() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMissions(missions.map(m => m.id === startingMission.id ? { ...m, ...updated } : m));
        toast.success('Viagem iniciada');
        setStartingMission(null);
        setStartKmValue('');
        setPlacaValue('');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Erro ao iniciar');
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelMission = async () => {
    if (!confirmCancelMission) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/missions/${confirmCancelMission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      if (res.ok) {
        // Remove da lista (some do dashboard automaticamente)
        setMissions(prev => prev.filter(m => m.id !== confirmCancelMission.id));
        toast.success('Missão cancelada');
        setConfirmCancelMission(null);
      } else {
        const e = await res.json();
        toast.error(e.error || 'Erro ao cancelar');
      }
    } finally {
      setLoading(false);
    }
  };

  const finishMission = async () => {
    if (!endingMission) return;
    if (!endKmValue) {
      toast.error('Informe o KM final');
      return;
    }
    const parsedEndKm = parsePortugueseFloat(endKmValue);
    if (endingMission.startKm != null && parsedEndKm < endingMission.startKm) {
      toast.error('KM final não pode ser menor que o inicial');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/missions/${endingMission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'COMPLETED',
          endKm: parsedEndKm,
          endNote: endNoteValue || null,
          endDate: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMissions(missions.map(m => m.id === endingMission.id ? { ...m, ...updated } : m));
        toast.success('Viagem finalizada!');
        setEndingMission(null);
        setEndKmValue('');
        setEndNoteValue('');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Erro ao finalizar');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="-mx-3 md:-mx-6 -my-3 md:-my-6 bg-gray-50 dark:bg-gray-950"
      style={{ paddingBottom: 'max(8rem, calc(6rem + env(safe-area-inset-bottom)))' }}
    >
      {/* Header */}
      <div
        className="bg-gradient-to-br from-sigma-600 to-sigma-800 text-white px-4 sm:px-6 pb-6 rounded-b-3xl shadow-lg"
        style={{ paddingTop: 'max(1.25rem, calc(env(safe-area-inset-top) + 1rem))' }}
      >
        <div className="flex items-center justify-between mb-4 pl-12 md:pl-0">
          <div className="min-w-0">
            <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wider truncate">
              Olá, {currentUser.name?.split(' ')[0]}
            </p>
            <h1 className="text-xl sm:text-2xl font-bold truncate">Minhas Viagens</h1>
          </div>
          <Link
            href="/missoes?desktop=1"
            className="flex-shrink-0 bg-white/15 backdrop-blur-md p-2.5 rounded-xl text-white/90 hover:bg-white/25 transition"
            title="Versão desktop"
          >
            <Monitor className="w-5 h-5" />
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatBubble label="Em Curso" value={inProgressTotal} />
          <StatBubble label="Planejadas" value={plannedTotal} />
          <StatBubble label="Total" value={allTotal} />
        </div>
      </div>

      <div className="px-3 sm:px-4 pt-4 space-y-4">
        {/* Barra de Busca */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por título, destino ou participante..."
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
        <div className="flex bg-white dark:bg-gray-900 p-1 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm gap-1">
          {[
            { id: 'in_progress', label: 'Em Curso', count: inProgressTotal, color: 'bg-orange-500' },
            { id: 'planned', label: 'Planejadas', count: plannedTotal, color: 'bg-sigma-600' },
            { id: 'completed', label: 'Concluídas', count: completedTotal, color: 'bg-green-600' },
            { id: 'all', label: 'Todas', count: allTotal, color: 'bg-gray-500' }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative flex-1 py-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center min-h-[46px] ${
                  isActive ? 'text-white' : 'text-subtle active:bg-gray-100 dark:active:bg-gray-800'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
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
        <motion.div 
          layout 
          className="space-y-3"
        >
          {activeTab === 'completed' && filteredMissions.length > 0 && (
            <div className="flex justify-end px-1 pb-1">
              <Link href="/missoes/relatorio" className="text-xs text-sigma-600 font-bold flex items-center gap-1">
                <FileBarChart className="w-3.5 h-3.5" /> Acessar Relatório Completo
              </Link>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {filteredMissions.map((m, idx) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, delay: Math.min(idx * 0.04, 0.2) }}
                layout
              >
                <MissionCard
                  mission={m}
                  action={
                    m.status === 'IN_PROGRESS' ? (
                      <button
                        onClick={() => { setEndingMission(m); setEndKmValue(''); }}
                        className="bg-green-600 active:scale-95 text-white text-xs font-bold px-3 py-2.5 rounded-xl shadow-md flex items-center gap-1"
                      >
                        <Flag className="w-3.5 h-3.5" /> Fim
                      </button>
                    ) : m.status === 'PLANNED' ? (
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => requestStart(m)}
                          disabled={!isScheduledDateReached(m.startDate)}
                          className="bg-sigma-600 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-md disabled:opacity-40 disabled:bg-gray-400"
                        >
                          Iniciar
                        </button>
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => openEdit(m)}
                            className="bg-gray-100 dark:bg-gray-800 text-body p-1.5 rounded-lg active:scale-95"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmCancelMission(m)}
                            className="bg-red-50 dark:bg-red-900/20 text-red-500 p-1.5 rounded-lg active:scale-95"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : undefined
                  }
                />
              </motion.div>
            ))}
          </AnimatePresence>
          
          {filteredMissions.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 px-4 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm"
            >
              <div className="w-16 h-16 mx-auto bg-sigma-50 dark:bg-sigma-900/30 rounded-2xl flex items-center justify-center mb-3">
                <CalendarIcon className="w-8 h-8 text-sigma-600" />
              </div>
              <h3 className="text-sm font-bold text-title">Nenhuma viagem encontrada</h3>
              <p className="text-xs text-subtle mt-1">
                {searchQuery ? 'Tente ajustar os termos da busca.' : 'Não há viagens para exibir nesta categoria.'}
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* FAB Nova Viagem */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed left-1/2 -translate-x-1/2 z-40 bg-sigma-600 active:bg-sigma-700 text-white px-6 py-4 rounded-full shadow-2xl shadow-sigma-600/40 font-bold flex items-center gap-2 active:scale-95 transition"
        style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
      >
        <Plus className="w-5 h-5" /> Nova Viagem
      </button>

      {/* Bottom Sheet — Form */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !loading && setShowForm(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
              style={{ height: '92dvh', maxHeight: '92dvh' }}
            >
              {/* Header com handle arrastável (só essa área fecha por swipe) */}
              <motion.div
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.4 }}
                onDragEnd={(_, info) => { if (info.offset.y > 80 && !loading) setShowForm(false); }}
                className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 rounded-t-3xl cursor-grab active:cursor-grabbing touch-none"
              >
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
                </div>
                <div className="px-5 pb-3 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-title">{editingId ? 'Editar Agendamento' : 'Nova Viagem'}</h3>
                  <button
                    type="button"
                    onClick={() => { if (!loading) { setShowForm(false); resetForm(); } }}
                    className="p-2 -m-2 text-subtle"
                    aria-label="Fechar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>

              <form
                onSubmit={submit}
                className="flex-1 flex flex-col min-h-0"
              >
                {/* Área scrollável dos campos */}
                <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
                {/* Título */}
                <FieldLabel>Título da Viagem</FieldLabel>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex: Diligência em Porto Velho"
                  className="w-full input-base px-4 py-3.5 text-base"
                />

                {/* Destino + GPS */}
                <FieldLabel>Destino</FieldLabel>
                <div className="flex gap-2">
                  <input
                    required
                    value={form.destination}
                    onChange={e => setForm({ ...form, destination: e.target.value })}
                    placeholder="Cidade / Local"
                    className="flex-1 input-base px-4 py-3.5 text-base"
                  />
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={gpsLoading}
                    className="bg-sigma-50 dark:bg-sigma-900/30 border border-sigma-200 dark:border-sigma-800 text-sigma-700 dark:text-sigma-400 px-4 rounded-xl flex items-center justify-center disabled:opacity-50 active:scale-95"
                    title="Usar minha localização"
                  >
                    {gpsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Navigation className="w-5 h-5" />}
                  </button>
                </div>

                {/* Iniciar agora — só na CRIAÇÃO, não na edição */}
                {!editingId && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, startNow: !f.startNow }))}
                    className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition active:scale-95 ${
                      form.startNow
                        ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/30'
                        : 'border-dashed border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-900/10'
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                    {form.startNow ? 'Iniciando agora — toque para desfazer' : 'Iniciar agora (registro pós-viagem)'}
                  </button>
                )}

                {/* Data agendada — escondida quando "iniciar agora" */}
                {!form.startNow && (
                  <>
                    <FieldLabel>Data Agendada</FieldLabel>
                    <input
                      required
                      type="date"
                      value={form.startDate}
                      onChange={e => setForm({ ...form, startDate: e.target.value })}
                      className="w-full input-base px-4 py-3.5 text-base"
                    />
                    {!editingId && (
                      <p className="text-[11px] text-subtle italic ml-1 -mt-2">
                        ℹ️ Hora de partida e KM serão registrados ao iniciar a viagem.
                      </p>
                    )}
                  </>
                )}

                {/* KM Inicial — só quando "iniciar agora" */}
                {form.startNow && (
                  <>
                    <FieldLabel>
                      <span className="flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5" /> KM Inicial *
                      </span>
                    </FieldLabel>
                    <input
                      required
                      type="text"
                      inputMode="decimal"
                      value={form.startKm}
                      onChange={e => setForm({ ...form, startKm: e.target.value })}
                      placeholder="Quilometragem atual do veículo"
                      className="w-full input-base px-4 py-3.5 text-base"
                    />
                  </>
                )}

                {/* Participantes */}
                <FieldLabel>Participantes</FieldLabel>
                <div className="grid grid-cols-3 gap-2">
                  {AVAILABLE_PARTICIPANTS.map(name => {
                    const selected = form.participants.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleParticipant(name)}
                        className={`px-2 py-2.5 rounded-xl text-[11px] font-bold border transition active:scale-95 truncate ${
                          selected
                            ? 'bg-sigma-600 border-sigma-500 text-white shadow-md shadow-sigma-600/20'
                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-body'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>

                {/* Grupo / Equipe */}
                <FieldLabel>Grupo / Equipe</FieldLabel>
                <select
                  value={form.groupId}
                  onChange={e => setForm({ ...form, groupId: e.target.value })}
                  className="w-full input-base px-4 py-3.5 text-base"
                >
                  <option value="">Selecione</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>

                {/* Previsão de Fim */}
                <FieldLabel>Previsão de Fim</FieldLabel>
                <input
                  type="datetime-local"
                  value={form.endDate}
                  onChange={e => setForm({ ...form, endDate: e.target.value })}
                  className="w-full input-base px-4 py-3.5 text-base"
                />

                {/* Observações */}
                <FieldLabel>Observações</FieldLabel>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Detalhes adicionais..."
                  className="w-full input-base px-4 py-3.5 text-base resize-none"
                />
                </div>

                {/* Footer fixo com CTA — sempre visível */}
                <div
                  className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 sm:px-5 pt-3"
                  style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                >
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-sigma-600 active:bg-sigma-700 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-sigma-600/30 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
                  >
                    {loading
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : (editingId ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />)}
                    {editingId
                      ? 'Salvar Alterações'
                      : (form.startNow ? 'Registrar e Iniciar' : 'Registrar Viagem')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Sheet — Finalizar viagem */}
      <AnimatePresence>
        {endingMission && (
          <div className="fixed inset-0 z-50">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !loading && setEndingMission(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl p-5 space-y-4"
              style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 1.5rem))' }}
            >
              <div className="flex justify-center mb-1">
                <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-title">Finalizar Viagem</h3>
                <p className="text-sm text-subtle">{endingMission.title} — {endingMission.destination}</p>
              </div>
              {endingMission.startKm != null && (
                <p className="text-xs text-subtle">KM Inicial: <span className="font-bold text-body">{endingMission.startKm.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span></p>
              )}
              <FieldLabel>KM Final</FieldLabel>
              <input
                autoFocus
                type="text"
                inputMode="decimal"
                value={endKmValue}
                onChange={e => setEndKmValue(e.target.value)}
                placeholder="Ex: 14523.75"
                className="w-full input-base px-4 py-4 text-lg font-bold"
              />
              <FieldLabel>Observação (opcional)</FieldLabel>
              <textarea
                rows={2}
                placeholder="Ex: viagem interrompida por…"
                value={endNoteValue}
                onChange={e => setEndNoteValue(e.target.value)}
                className="w-full input-base px-4 py-3 text-base resize-none"
              />
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setEndingMission(null); setEndKmValue(''); setEndNoteValue(''); }}
                  className="flex-1 border border-gray-200 dark:border-gray-700 text-body py-3.5 rounded-2xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={finishMission}
                  disabled={loading}
                  className="flex-1 bg-green-600 active:bg-green-700 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-green-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Concluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Sheet — Iniciar viagem (KM inicial) */}
      <AnimatePresence>
        {startingMission && (
          <div className="fixed inset-0 z-50">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !loading && setStartingMission(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl p-5 space-y-4"
              style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 1.5rem))' }}
            >
              <div className="flex justify-center mb-1">
                <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-title">Iniciar Viagem</h3>
                <p className="text-sm text-subtle">{startingMission.title} — {startingMission.destination}</p>
                <p className="text-xs text-subtle mt-1 italic">Hora de partida será registrada automaticamente.</p>
              </div>
              <FieldLabel>Placa do Veículo</FieldLabel>
              <input
                autoFocus
                type="text"
                value={placaValue}
                onChange={e => setPlacaValue(e.target.value.toUpperCase())}
                placeholder="Ex: ABC1D23"
                maxLength={8}
                className="w-full input-base px-4 py-4 text-lg font-bold font-mono tracking-widest uppercase"
              />
              <FieldLabel>KM Inicial</FieldLabel>
              <input
                type="text"
                inputMode="decimal"
                value={startKmValue}
                onChange={e => setStartKmValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmStart(); }}
                placeholder="Ex: 14200.50"
                className="w-full input-base px-4 py-4 text-lg font-bold"
              />
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setStartingMission(null); setStartKmValue(''); setPlacaValue(''); }}
                  className="flex-1 border border-gray-200 dark:border-gray-700 text-body py-3.5 rounded-2xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmStart}
                  disabled={loading}
                  className="flex-1 bg-sigma-600 active:bg-sigma-700 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-sigma-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Flag className="w-5 h-5" />}
                  Iniciar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Sheet — Confirmar Cancelamento */}
      <AnimatePresence>
        {confirmCancelMission && (
          <div className="fixed inset-0 z-50">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !loading && setConfirmCancelMission(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl p-5 space-y-4"
              style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 1.5rem))' }}
            >
              <div className="flex justify-center mb-1">
                <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
              </div>
              <div className="text-center">
                <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-7 h-7 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-title">Cancelar missão?</h3>
                <p className="text-sm text-subtle mt-1">
                  <span className="font-semibold text-body">{confirmCancelMission.title}</span>
                  <br/>
                  Esta ação não pode ser desfeita. A missão sairá do calendário.
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setConfirmCancelMission(null)}
                  className="flex-1 border border-gray-200 dark:border-gray-700 text-body py-3.5 rounded-2xl font-semibold"
                >
                  Voltar
                </button>
                <button
                  onClick={cancelMission}
                  disabled={loading}
                  className="flex-1 bg-red-600 active:bg-red-700 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />}
                  Sim, cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider ml-0.5">{children}</label>;
}

function StatBubble({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3 text-center">
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-white/70 mt-1 font-semibold">{label}</p>
    </div>
  );
}

function MissionCard({ mission, action }: { mission: Mission; action?: React.ReactNode }) {
  const statusBg: Record<Mission['status'], string> = {
    PLANNED: 'border-l-blue-400',
    IN_PROGRESS: 'border-l-orange-500',
    COMPLETED: 'border-l-green-500',
    CANCELLED: 'border-l-red-400',
  };
  const km = (mission.startKm != null && mission.endKm != null) ? mission.endKm - mission.startKm : null;

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 border-l-4 ${statusBg[mission.status]} p-3.5 shadow-sm`}>
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-title text-sm leading-tight truncate">{mission.title}</p>
          <p className="text-xs text-subtle mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{mission.destination}</span>
          </p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-subtle">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(mission.startDate), "dd/MM HH:mm", { locale: ptBR })}
            </span>
            {km != null && (
              <span className="flex items-center gap-1 text-sigma-600 dark:text-sigma-400 font-bold">
                <Gauge className="w-3 h-3" /> {km} km
              </span>
            )}
            {mission.placa && (
              <span className="font-mono font-bold tracking-widest text-body">
                🚗 {mission.placa}
              </span>
            )}
            {mission.group && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: mission.group.color ?? '#6172f3' }} />
                {mission.group.name}
              </span>
            )}
          </div>
          {mission.participants && mission.participants.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-800/80">
              {mission.participants.map(p => (
                <span
                  key={p}
                  className="text-[9px] bg-sigma-50 dark:bg-sigma-950/40 text-sigma-600 dark:text-sigma-400 border border-sigma-100/50 dark:border-sigma-900/30 px-2 py-0.5 rounded-full font-bold animate-fade-in"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {mission.status === 'COMPLETED' && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800/80 flex items-center gap-1 text-[10px] text-green-600 font-semibold">
          <CheckCircle2 className="w-3 h-3" /> {STATUS_LABEL[mission.status]}
        </div>
      )}
    </div>
  );
}
