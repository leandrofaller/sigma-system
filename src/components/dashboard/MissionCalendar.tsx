'use client';

import { useState, useEffect } from 'react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, 
  isSameDay, addDays, isToday 
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  ChevronLeft, ChevronRight, Plus, MapPin, 
  Clock, CheckCircle2, AlertCircle, X, 
  MoreHorizontal, Calendar as CalendarIcon,
  User as UserIcon, Users, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Mission {
  id: string;
  title: string;
  description?: string;
  destination: string;
  startDate: string;
  endDate?: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  userId: string;
  user: { name: string; avatar?: string };
  groupId?: string;
  group?: { name: string; color?: string };
  participants: string[];
  startKm?: number;
  endKm?: number;
}

const AVAILABLE_PARTICIPANTS = [
  'GEAN', 'JAQUELINE', 'JEFFERSON', 'JORDANIO', 
  'SIQUEIRA', 'FALLER', 'RAFAEL', 'SIDNEI', 
  'STAUSTON', 'VALTEIR'
];

interface Props {
  initialMissions: Mission[];
  currentUser: { id: string; role: string; groupId?: string };
  groups: any[];
}

export function MissionCalendar({ initialMissions, currentUser, groups }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingMission, setViewingMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEndKmInput, setShowEndKmInput] = useState(false);
  const [endKmValue, setEndKmValue] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    destination: '',
    startDate: '',
    endDate: '',
    groupId: currentUser.groupId || '',
    participants: [] as string[],
    startKm: '',
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getMissionsForDay = (day: Date) => {
    return missions.filter(m => isSameDay(new Date(m.startDate), day));
  };

  const handleAddMission = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        const newMission = await res.json();
        setMissions([...missions, newMission]);
        setShowAddForm(false);
        setFormData({ 
          title: '', description: '', destination: '', 
          startDate: '', endDate: '', groupId: currentUser.groupId || '',
          participants: [],
          startKm: ''
        });
        toast.success('Missão agendada com sucesso!');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erro ao agendar missão');
      }
    } catch (err) {
      toast.error('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const updateMissionStatus = async (id: string, status: string, additionalData?: any) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/missions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...additionalData }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMissions(missions.map(m => m.id === id ? updated : m));
        setViewingMission(updated);
        setShowEndKmInput(false);
        setEndKmValue('');
        toast.success('Missão atualizada!');
      }
    } catch (err) {
      toast.error('Erro ao atualizar missão');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PLANNED': return <span className="badge-blue">Planejada</span>;
      case 'IN_PROGRESS': return <span className="badge-orange animate-pulse">Em Curso</span>;
      case 'COMPLETED': return <span className="badge-green">Concluída</span>;
      case 'CANCELLED': return <span className="badge-red">Cancelada</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-xl font-bold text-title capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </h2>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentMonth(new Date())}
            className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Hoje
          </button>
          <button 
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-sigma-600/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Nova Missão
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden">
        {/* Days of week header */}
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
            <div key={day} className="py-4 text-center text-xs font-bold text-subtle uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dayMissions = getMissionsForDay(day);
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isTodayDay = isToday(day);

            return (
              <div 
                key={day.toString()}
                onClick={() => {
                  if (dayMissions.length > 0) setSelectedDay(day);
                  else {
                    setFormData({ ...formData, startDate: format(day, "yyyy-MM-dd'T'HH:mm") });
                    setShowAddForm(true);
                  }
                }}
                className={`min-h-[120px] p-2 border-r border-b border-gray-50 dark:border-gray-800/50 cursor-pointer transition-all hover:bg-sigma-50/30 dark:hover:bg-sigma-900/10
                  ${!isCurrentMonth ? 'bg-gray-50/50 dark:bg-gray-800/20' : ''}
                  ${i % 7 === 6 ? 'border-r-0' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-lg
                    ${isTodayDay ? 'bg-sigma-600 text-white shadow-lg shadow-sigma-600/30' : 
                      isCurrentMonth ? 'text-title' : 'text-gray-300 dark:text-gray-600'}`}>
                    {format(day, 'd')}
                  </span>
                  {dayMissions.length > 0 && (
                    <span className="text-[10px] bg-sigma-100 dark:bg-sigma-900/30 text-sigma-600 dark:text-sigma-400 px-1.5 py-0.5 rounded-full font-bold">
                      {dayMissions.length}
                    </span>
                  )}
                </div>

                <div className="space-y-1 overflow-y-auto max-h-[80px] scrollbar-hide">
                  {dayMissions.slice(0, 3).map(m => (
                    <div 
                      key={m.id}
                      onClick={(e) => { e.stopPropagation(); setViewingMission(m); }}
                      className="text-[10px] px-2 py-1 rounded-md border truncate transition-all hover:scale-105"
                      style={{ 
                        borderColor: m.group?.color ? `${m.group.color}40` : '#6172f340',
                        background: m.group?.color ? `${m.group.color}10` : '#6172f310',
                        color: m.group?.color || '#6172f3'
                      }}
                    >
                      {m.title}
                    </div>
                  ))}
                  {dayMissions.length > 3 && (
                    <div className="text-[9px] text-center text-subtle font-medium">
                      + {dayMissions.length - 3} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Viewing Mission Modal */}
      <AnimatePresence>
        {viewingMission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setViewingMission(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden relative z-10"
            >
              <div className="h-24 bg-gradient-to-r from-sigma-500 to-sigma-700 p-6 flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white">
                    <CalendarIcon className="w-6 h-6" />
                  </div>
                  <div className="text-white">
                    <h3 className="font-bold text-lg leading-tight">{viewingMission.title}</h3>
                    <p className="text-white/80 text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {viewingMission.destination}
                    </p>
                  </div>
                </div>
                <button onClick={() => setViewingMission(null)} className="text-white/60 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-subtle uppercase tracking-wider">Status</p>
                    {getStatusBadge(viewingMission.status)}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-subtle uppercase tracking-wider">Agência/Grupo</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: viewingMission.group?.color }} />
                      <span className="text-sm font-medium text-body">{viewingMission.group?.name || 'Geral'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-body">
                    <Clock className="w-4 h-4 text-sigma-500" />
                    <span>
                      {format(new Date(viewingMission.startDate), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      {viewingMission.endDate && ` — ${format(new Date(viewingMission.endDate), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}`}
                    </span>
                  </div>
                  {viewingMission.startKm && (
                    <div className="flex items-center gap-3 text-sm text-body">
                      <div className="w-4 h-4 text-sigma-500 flex items-center justify-center font-bold text-[10px]">KM</div>
                      <span>KM Inicial: <span className="font-bold">{viewingMission.startKm}</span>
                        {viewingMission.endKm && <span> — KM Final: <span className="font-bold">{viewingMission.endKm}</span></span>}
                        {viewingMission.endKm && <span className="ml-2 text-sigma-600">(Total: {viewingMission.endKm - viewingMission.startKm} km)</span>}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-sm text-body">
                    <UserIcon className="w-4 h-4 text-sigma-500" />
                    <span>Responsável: <span className="font-medium">{viewingMission.user.name}</span></span>
                  </div>
                </div>

                {viewingMission.participants && viewingMission.participants.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-subtle uppercase tracking-wider">Participantes</p>
                    <div className="flex flex-wrap gap-2">
                      {viewingMission.participants.map(p => (
                        <span key={p} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-title text-[10px] font-bold rounded-lg border border-gray-200 dark:border-gray-700">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {viewingMission.description && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-subtle uppercase tracking-wider mb-2">Descrição</p>
                    <p className="text-sm text-body leading-relaxed">{viewingMission.description}</p>
                  </div>
                )}

                {showEndKmInput ? (
                  <div className="bg-sigma-50 dark:bg-sigma-900/20 p-4 rounded-2xl border border-sigma-100 dark:border-sigma-900/30 space-y-3">
                    <p className="text-xs font-bold text-sigma-700 dark:text-sigma-300">Informe a Kilometragem Final para concluir:</p>
                    <div className="flex gap-2">
                      <input 
                        type="number"
                        placeholder="KM Final"
                        value={endKmValue}
                        onChange={e => setEndKmValue(e.target.value)}
                        className="flex-1 input-base px-4 py-2"
                        autoFocus
                      />
                      <button 
                        onClick={() => {
                          if (!endKmValue) return toast.error('Informe a kilometragem final');
                          if (viewingMission.startKm && parseInt(endKmValue) < viewingMission.startKm) {
                            return toast.error('KM final não pode ser menor que o inicial');
                          }
                          updateMissionStatus(viewingMission.id, 'COMPLETED', { endKm: endKmValue });
                        }}
                        className="bg-sigma-600 text-white px-4 py-2 rounded-xl font-bold text-xs"
                      >
                        Confirmar
                      </button>
                      <button 
                        onClick={() => setShowEndKmInput(false)}
                        className="bg-gray-200 dark:bg-gray-800 text-body px-3 py-2 rounded-xl text-xs"
                      >
                        X
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 pt-2">
                    {viewingMission.status === 'PLANNED' && (
                      <button 
                        onClick={() => updateMissionStatus(viewingMission.id, 'IN_PROGRESS')}
                        className="flex-1 bg-sigma-600 hover:bg-sigma-700 text-white py-3 rounded-2xl font-bold shadow-lg shadow-sigma-600/20 transition-all active:scale-95"
                      >
                        Iniciar Viagem
                      </button>
                    )}
                    {viewingMission.status === 'IN_PROGRESS' && (
                      <button 
                        onClick={() => setShowEndKmInput(true)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-2xl font-bold shadow-lg shadow-green-600/20 transition-all active:scale-95"
                      >
                        Finalizar na Chegada
                      </button>
                    )}
                    {(currentUser.role === 'SUPER_ADMIN' || viewingMission.userId === currentUser.id) && viewingMission.status !== 'COMPLETED' && (
                      <button 
                        onClick={() => updateMissionStatus(viewingMission.id, 'CANCELLED')}
                        className="px-4 border border-red-200 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-2xl transition-colors"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Mission Modal */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddForm(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden relative z-10"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-bold text-title flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-sigma-600" /> Agendar Nova Missão
                </h3>
                <button onClick={() => setShowAddForm(false)} className="text-subtle hover:text-body transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddMission} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-subtle uppercase tracking-wider ml-1">Título da Missão</label>
                  <input 
                    required
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: Escolta de Autoridade, Diligência em Campo..."
                    className="w-full input-base px-4 py-3"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-subtle uppercase tracking-wider ml-1">Destino</label>
                    <input 
                      required
                      value={formData.destination}
                      onChange={e => setFormData({ ...formData, destination: e.target.value })}
                      placeholder="Cidade/Local"
                      className="w-full input-base px-4 py-3"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-subtle uppercase tracking-wider ml-1">Grupo/Equipe</label>
                    <select 
                      value={formData.groupId}
                      onChange={e => setFormData({ ...formData, groupId: e.target.value })}
                      className="w-full input-base px-4 py-3"
                    >
                      <option value="">Selecione um grupo</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-subtle uppercase tracking-wider ml-1">Início</label>
                    <input 
                      required
                      type="datetime-local"
                      value={formData.startDate}
                      onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full input-base px-4 py-3"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-subtle uppercase tracking-wider ml-1">Previsão Fim</label>
                    <input 
                      type="datetime-local"
                      value={formData.endDate}
                      onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full input-base px-4 py-3"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-subtle uppercase tracking-wider ml-1">KM Inicial</label>
                    <input 
                      type="number"
                      value={formData.startKm}
                      onChange={e => setFormData({ ...formData, startKm: e.target.value })}
                      placeholder="0"
                      className="w-full input-base px-4 py-3"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-subtle uppercase tracking-wider ml-1">Participantes</label>
                  <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700">
                    {AVAILABLE_PARTICIPANTS.map(name => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          const current = formData.participants;
                          if (current.includes(name)) {
                            setFormData({ ...formData, participants: current.filter(n => n !== name) });
                          } else {
                            setFormData({ ...formData, participants: [...current, name] });
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border
                          ${formData.participants.includes(name) 
                            ? 'bg-sigma-600 border-sigma-500 text-white shadow-md shadow-sigma-600/20 scale-105' 
                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-subtle hover:border-sigma-400'}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-subtle uppercase tracking-wider ml-1">Observações</label>
                  <textarea 
                    rows={3}
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Detalhes adicionais da missão..."
                    className="w-full input-base px-4 py-3 resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-body font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="flex-1 bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-3 rounded-2xl font-bold shadow-lg shadow-sigma-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Agendar Missão
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
