'use client';

import { useEffect, useState } from 'react';
import { GeoMonitorPanelWrapper } from '@/components/admin/GeoMonitorPanelWrapper';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface MonitoringData {
  locations: any[];
  allUsers: any[];
  onlineUsers: any[];
  tablesMissing: boolean;
}

export default function MonitoramentoPage() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/monitoring/locations');
        if (!res.ok) throw new Error('Falha ao carregar dados');
        const result = await res.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-title">Monitoramento de Localização</h1>
          <p className="text-sm text-subtle mt-1">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-title">Monitoramento de Localização</h1>
        </div>
        <div className="rounded-xl border border-red-700/40 bg-red-900/20 p-6 text-red-300 text-sm">
          <p className="font-semibold">Erro ao carregar dados: {error || 'Desconhecido'}</p>
        </div>
      </div>
    );
  }

  const { locations, allUsers, onlineUsers, tablesMissing } = data;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-title">Monitoramento de Localização</h1>
        <p className="text-sm text-subtle mt-1">
          Visualize em tempo real a última posição registrada de cada usuário. Os dados são coletados no login com permissão do navegador.
        </p>
      </div>
      {tablesMissing ? (
        <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-6 text-amber-300 text-sm space-y-2">
          <p className="font-semibold">Tabela de localização não encontrada no banco de dados.</p>
          <p className="text-amber-400/80">Execute a migração do Prisma para criar a tabela <code className="bg-amber-900/40 px-1 rounded">user_locations</code>:</p>
          <pre className="bg-gray-900 text-gray-300 rounded-lg p-3 text-xs overflow-x-auto">npx prisma migrate deploy</pre>
        </div>
      ) : (
        <ErrorBoundary>
          <GeoMonitorPanelWrapper
            locations={locations}
            allUsers={allUsers}
            onlineUsers={onlineUsers}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
