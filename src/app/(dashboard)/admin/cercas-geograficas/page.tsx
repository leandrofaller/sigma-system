'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Locate, Trash2, ShieldAlert, CheckCircle, HelpCircle, ToggleLeft, ToggleRight, PlusCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// Import dinâmico do mapa do Leaflet para evitar problemas de SSR no Next.js
const GeofencesMap = dynamic(() => import('@/components/admin/GeofencesMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[550px] bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-700 animate-pulse">
      <span className="text-gray-500">Carregando mapa...</span>
    </div>
  )
});

interface Geofence {
  id: string;
  name: string;
  type: string;
  action: string;
  coordinates: {
    lat: number;
    lng: number;
    radius: number;
  };
  isActive: boolean;
  createdAt: string;
}

export default function GeofencesAdminPage() {
  const [fences, setFences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFenceId, setSelectedFenceId] = useState<string | null>(null);

  // Estado para o formulário de nova cerca
  const [newFenceName, setNewFenceName] = useState('');
  const [newFenceAction, setNewFenceAction] = useState<'allow' | 'deny'>('deny');
  const [newFenceRadius, setNewFenceRadius] = useState<number>(200); // 200m padrão
  const [newFenceLat, setNewFenceLat] = useState<number | null>(null);
  const [newFenceLng, setNewFenceLng] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchFences();
  }, []);

  const fetchFences = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/geofences');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setFences(data.fences || []);
        }
      } else {
        toast.error('Erro ao carregar cercas geográficas');
      }
    } catch (err) {
      console.error(err);
      toast.error('Falha de rede ao obter cercas');
    } finally {
      setLoading(false);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    setNewFenceLat(parseFloat(lat.toFixed(6)));
    setNewFenceLng(parseFloat(lng.toFixed(6)));
    toast.success('Ponto central da cerca definido!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newFenceName.trim()) {
      toast.error('Digite um nome para a cerca');
      return;
    }

    if (newFenceLat === null || newFenceLng === null) {
      toast.error('Clique no mapa para definir o local da cerca');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/geofences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFenceName,
          type: 'circle',
          action: newFenceAction,
          coordinates: {
            lat: newFenceLat,
            lng: newFenceLng,
            radius: newFenceRadius
          },
          isActive: true
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Cerca geográfica criada com sucesso!');
        // Reset formulário
        setNewFenceName('');
        setNewFenceLat(null);
        setNewFenceLng(null);
        fetchFences();
      } else {
        toast.error(data.error || 'Erro ao criar cerca geográfica');
      }
    } catch (err) {
      console.error(err);
      toast.error('Falha de rede ao criar cerca');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/geofences/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Status atualizado!');
        fetchFences();
      } else {
        toast.error(data.error || 'Erro ao atualizar cerca');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro na requisição');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir a cerca geográfica "${name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/geofences/${id}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Cerca geográfica removida!');
        if (selectedFenceId === id) setSelectedFenceId(null);
        fetchFences();
      } else {
        toast.error(data.error || 'Erro ao excluir cerca');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir cerca');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Locate className="w-7 h-7 text-sigma-600 dark:text-sigma-400" />
            Gerenciamento de Cercas Geográficas
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Restrinja o acesso ao sistema em localizações específicas ou libere somente em perímetros autorizados.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna do Mapa (Esquerda) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-150 dark:border-gray-750">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
              Mapa de Cercas Ativas
            </h2>
            <GeofencesMap
              fences={fences}
              selectedFenceId={selectedFenceId}
              newFence={{
                lat: newFenceLat,
                lng: newFenceLng,
                radius: newFenceRadius,
                type: 'circle',
                action: newFenceAction
              }}
              onMapClick={handleMapClick}
            />
          </div>
        </div>

        {/* Coluna do Formulário (Direita) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card de Cadastro */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-150 dark:border-gray-750">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
              <PlusCircle className="w-5 h-5 text-sigma-500" />
              Criar Nova Cerca
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Nome da Cerca
                </label>
                <input
                  type="text"
                  placeholder="Ex: Sede Administrativa / Área de Risco X"
                  value={newFenceName}
                  onChange={(e) => setNewFenceName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-650 bg-white dark:bg-gray-750 text-gray-900 dark:text-white px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sigma-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Ação da Cerca
                  </label>
                  <select
                    value={newFenceAction}
                    onChange={(e) => setNewFenceAction(e.target.value as 'allow' | 'deny')}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-650 bg-white dark:bg-gray-750 text-gray-900 dark:text-white px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sigma-500"
                  >
                    <option value="deny">🚫 Bloquear Dentro</option>
                    <option value="allow">✅ Permitir Apenas Dentro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Raio (metros)
                  </label>
                  <select
                    value={newFenceRadius}
                    onChange={(e) => setNewFenceRadius(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-650 bg-white dark:bg-gray-750 text-gray-900 dark:text-white px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sigma-500"
                  >
                    <option value={50}>50 m</option>
                    <option value={100}>100 m</option>
                    <option value={200}>200 m</option>
                    <option value={500}>500 m</option>
                    <option value={1000}>1 km</option>
                    <option value={2000}>2 km</option>
                    <option value={5000}>5 km</option>
                  </select>
                </div>
              </div>

              {/* Coordenadas capturadas */}
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700 space-y-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">
                  Coordenadas Centrais (Clique no mapa)
                </span>
                {newFenceLat !== null && newFenceLng !== null ? (
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-gray-700 dark:text-gray-300">
                    <div>Lat: {newFenceLat}</div>
                    <div>Lng: {newFenceLng}</div>
                  </div>
                ) : (
                  <div className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5 py-0.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Nenhum ponto selecionado no mapa
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-sigma-600 hover:bg-sigma-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow text-sm disabled:opacity-50"
              >
                {submitting ? 'Salvando...' : 'Salvar Cerca Geográfica'}
              </button>
            </form>
          </div>

          {/* Dicas Informativas */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4" />
              Como funcionam as regras?
            </h4>
            <ul className="text-xs text-blue-800 dark:text-blue-400 space-y-1.5 list-disc pl-4">
              <li>
                <strong>Bloquear Dentro (Deny):</strong> Proíbe o uso do sistema se o usuário estiver dentro dessa cerca.
              </li>
              <li>
                <strong>Permitir Apenas Dentro (Allow):</strong> O uso só é liberado se o usuário estiver dentro de pelo menos uma cerca deste tipo.
              </li>
              <li>Administradores possuem permissão de acesso irrestrito independente das cercas.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Tabela de Listagem (Parte Inferior) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-150 dark:border-gray-750">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Cercas Geográficas Cadastradas
        </h2>

        {loading ? (
          <div className="text-center py-6 text-gray-500">Carregando listagem...</div>
        ) : fences.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 border border-dashed border-gray-250 dark:border-gray-700 rounded-lg">
            Nenhuma cerca geográfica cadastrada no sistema.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Tipo / Configuração</th>
                  <th className="px-4 py-3">Ação</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {fences.map((fence) => (
                  <tr
                    key={fence.id}
                    onClick={() => setSelectedFenceId(fence.id)}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors cursor-pointer ${
                      selectedFenceId === fence.id ? 'bg-sigma-50 dark:bg-sigma-900/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3.5 font-semibold text-gray-900 dark:text-white">
                      {fence.name}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs">
                      {fence.type === 'circle' ? (
                        <span>
                          Raio: {fence.coordinates.radius}m <br />
                          Lat: {fence.coordinates.lat} / Lng: {fence.coordinates.lng}
                        </span>
                      ) : (
                        <span>Polígono</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {fence.action === 'allow' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-150 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Permitir Uso
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-150 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Bloquear Uso
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(fence.id, fence.isActive);
                        }}
                        className="hover:scale-105 transition-transform"
                      >
                        {fence.isActive ? (
                          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold text-xs">
                            <ToggleRight className="w-6 h-6 text-green-500" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 font-medium text-xs">
                            <ToggleLeft className="w-6 h-6 text-gray-400" />
                            Inativo
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(fence.id, fence.name)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 hover:scale-110 transition-transform p-1"
                        title="Excluir Cerca"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
