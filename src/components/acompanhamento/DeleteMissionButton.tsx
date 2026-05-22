'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';

export function DeleteMissionButton({ missionId }: { missionId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Excluir esta missão permanentemente? Esta ação não pode ser desfeita.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/missions/${missionId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erro ao excluir a missão.');
        return;
      }
      router.refresh();
    } catch {
      alert('Erro ao excluir a missão.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={deleting}
      title="Excluir missão"
      className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-400 hover:text-red-500 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50 shadow-sm"
    >
      {deleting
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  );
}
