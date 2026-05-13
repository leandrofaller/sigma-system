'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus, MapPin, Clock, CheckCircle2, X, Loader2,
  Navigation, Zap, Monitor, ChevronDown, ChevronUp,
  Calendar as CalendarIcon, Gauge, FileBarChart, Flag,
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
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  userId: string;
  groupId?: string | null;
  group?: { id: string; name: string; color?: string | null } | null;
  participants: string[];
  startKm?: number | null;
  endKm?: number | null;
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

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function MobileMissionView({ initialMissions, groups, currentUser }: Props) {
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [showForm, setShowForm] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [endingMission, setEndingMission] = useState<Mission | null>(null);
  const [endKmValue, setEndKmValue] = useState('');

  const [form, setForm] = useState({
    title: '',
    destination: '',
    startDate: nowLocalInput(),
    startKm: '',
    participants: [] as string[],
    description: '',
    endDate: '',
    groupId: currentUser.groupId || '',
    startNow: false,
  });

  const inProgress = missions.filter(m => m.status === 'IN_PROGRESS');
  const planned = missions.filter(m => m.status === 'PLANNED');
  const recent = missions.filter(m => m.status === 'COMPLETED' || m.status === 'CANCELLED').slice(0, 8);

  const resetForm = () => {
    setForm({
      title: '', destination: '', startDate: nowLocalInput(), startKm: '',
      participants: [], description: '', endDate: '',
      groupId: currentUser.groupId || '', startNow: false,
    });
    setShowMore(false);
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
    setLoading(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        destination: form.destination,
        startDate: form.startNow ? new Date().toISOString() : form.startDate,
        endDate: form.endDate || undefined,
        groupId: form.groupId || undefined,
        participants: form.participants,
        startKm: form.startKm || undefined,
      };

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

      // Se "iniciar agora", já marca como IN_PROGRESS
      if (form.startNow) {
        const upd = await fetch(`/api/missions/${newMission.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'IN_PROGRESS' }),
        });
        if (upd.ok) {
          const updated = await upd.json();
          setMissions([{ ...updated, group: newMission.group }, ...missions]);
          toast.success('Viagem iniciada!');
        } else {
          setMissions([newMission, ...missions]);
          toast.success('Viagem registrada (não foi possível iniciar)');
        }
      } else {
        setMissions([newMission, ...missions]);
        toast.success('Viagem registrada!');
      }

      resetForm();
      setShowForm(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const startMission = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/missions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMissions(missions.map(m => m.id === id ? { ...m, ...updated } : m));
        toast.success('Viagem iniciada');
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
    if (endingMission.startKm != null && parseInt(endKmValue) < endingMission.startKm) {
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
          endKm: endKmValue,
          endDate: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMissions(missions.map(m => m.id === endingMission.id ? { ...m, ...updated } : m));
        toast.success('Viagem finalizada!');
        setEndingMission(null);
        setEndKmValue('');
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
          <StatBubble label="Em Curso" value={inProgress.length} />
          <StatBubble label="Planejadas" value={planned.length} />
          <StatBubble label="Total" value={missions.length} />
        </div>
      </div>

      <div className="px-3 sm:px-4 pt-4 space-y-5">
        {/* Em curso (destaque) */}
        {inProgress.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-subtle uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-orange-500 animate-pulse" /> Viagens em Curso
            </h2>
            <div className="space-y-2">
              {inProgress.map(m => (
                <MissionCard key={m.id} mission={m}
                  action={
                    <button
                      onClick={() => { setEndingMission(m); setEndKmValue(''); }}
                      className="bg-green-600 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-md flex items-center gap-1.5"
                    >
                      <Flag className="w-3.5 h-3.5" /> Finalizar
                    </button>
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Planejadas */}
        {planned.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-subtle uppercase tracking-wider mb-2 px-1">Planejadas</h2>
            <div className="space-y-2">
              {planned.slice(0, 5).map(m => (
                <MissionCard key={m.id} mission={m}
                  action={
                    <button
                      onClick={() => startMission(m.id)}
                      className="bg-sigma-600 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-md"
                    >
                      Iniciar
                    </button>
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Recentes */}
        {recent.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-xs font-bold text-subtle uppercase tracking-wider">Histórico Recente</h2>
              <Link href="/missoes/relatorio" className="text-[11px] text-sigma-600 font-semibold flex items-center gap-1">
                <FileBarChart className="w-3 h-3" /> Relatório
              </Link>
            </div>
            <div className="space-y-2">
              {recent.map(m => <MissionCard key={m.id} mission={m} />)}
            </div>
          </section>
        )}

        {/* Vazio */}
        {missions.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="w-20 h-20 mx-auto bg-sigma-100 dark:bg-sigma-900/30 rounded-3xl flex items-center justify-center mb-4">
              <CalendarIcon className="w-10 h-10 text-sigma-600" />
            </div>
            <h3 className="text-lg font-bold text-title">Nenhuma viagem ainda</h3>
            <p className="text-sm text-subtle mt-1">Toque no botão abaixo para registrar sua primeira viagem.</p>
          </div>
        )}
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
                  <h3 className="text-lg font-bold text-title">Nova Viagem</h3>
                  <button
                    type="button"
                    onClick={() => !loading && setShowForm(false)}
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

                {/* Iniciar agora */}
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
                  {form.startNow ? 'Iniciando agora — toque para desfazer' : 'Iniciar agora (data/hora atual)'}
                </button>

                {/* Data/hora — escondida quando "iniciar agora" */}
                {!form.startNow && (
                  <>
                    <FieldLabel>Data e Hora de Início</FieldLabel>
                    <input
                      required
                      type="datetime-local"
                      value={form.startDate}
                      onChange={e => setForm({ ...form, startDate: e.target.value })}
                      className="w-full input-base px-4 py-3.5 text-base"
                    />
                  </>
                )}

                {/* KM Inicial */}
                <FieldLabel>
                  <span className="flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5" /> KM Inicial
                  </span>
                </FieldLabel>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.startKm}
                  onChange={e => setForm({ ...form, startKm: e.target.value })}
                  placeholder="0"
                  className="w-full input-base px-4 py-3.5 text-base"
                />

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

                {/* Mais opções */}
                <button
                  type="button"
                  onClick={() => setShowMore(!showMore)}
                  className="w-full flex items-center justify-between text-sm text-subtle font-semibold py-2 border-t border-gray-100 dark:border-gray-800 mt-2"
                >
                  <span>Mais opções</span>
                  {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showMore && (
                  <div className="space-y-3 pt-1">
                    <FieldLabel>Grupo / Equipe</FieldLabel>
                    <select
                      value={form.groupId}
                      onChange={e => setForm({ ...form, groupId: e.target.value })}
                      className="w-full input-base px-4 py-3 text-base"
                    >
                      <option value="">Selecione</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>

                    <FieldLabel>Previsão de Fim</FieldLabel>
                    <input
                      type="datetime-local"
                      value={form.endDate}
                      onChange={e => setForm({ ...form, endDate: e.target.value })}
                      className="w-full input-base px-4 py-3 text-base"
                    />

                    <FieldLabel>Observações</FieldLabel>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="Detalhes adicionais..."
                      className="w-full input-base px-4 py-3 text-base resize-none"
                    />
                  </div>
                )}
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
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {form.startNow ? 'Registrar e Iniciar' : 'Registrar Viagem'}
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
                <p className="text-xs text-subtle">KM Inicial: <span className="font-bold text-body">{endingMission.startKm}</span></p>
              )}
              <FieldLabel>KM Final</FieldLabel>
              <input
                autoFocus
                type="number"
                inputMode="numeric"
                value={endKmValue}
                onChange={e => setEndKmValue(e.target.value)}
                placeholder="Ex: 14523"
                className="w-full input-base px-4 py-4 text-lg font-bold"
              />
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setEndingMission(null)}
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
            {mission.group && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: mission.group.color ?? '#6172f3' }} />
                {mission.group.name}
              </span>
            )}
          </div>
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
