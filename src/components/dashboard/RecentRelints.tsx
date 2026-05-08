'use client';

import Link from 'next/link';
import { formatDate, getClassificationColor } from '@/lib/utils';
import { FileText, Plus } from 'lucide-react';
import type { RelintWithRelations } from '@/types';

interface Props {
  relints: RelintWithRelations[];
  role: string;
}

export function RecentRelints({ relints, role }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between p-6 border-b border-gray-50">
        <h3 className="text-base font-semibold text-gray-900">RELINTs Recentes</h3>
        <Link href="/relints/novo"
          className="flex items-center gap-1.5 text-sm text-sigma-600 hover:text-sigma-700 font-medium bg-sigma-50 px-3 py-1.5 rounded-lg hover:bg-sigma-100 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo RELINT
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {relints.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Nenhum relatório encontrado</p>
          </div>
        )}
        {relints.map((relint) => (
          <Link key={relint.id} href={`/relints/${relint.id}`}
            className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
            <div className="w-9 h-9 bg-sigma-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-sigma-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{relint.subject}</p>
              <p className="text-xs text-gray-400 mt-0.5">{relint.number} · {relint.author.name}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getClassificationColor(relint.classification)}`}>
                {relint.classification}
              </span>
              <span className="text-xs text-gray-400">{formatDate(relint.createdAt)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
