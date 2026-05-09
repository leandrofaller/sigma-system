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
    <div className="card">
      <div className="flex items-center justify-between p-6 card-header">
        <h3 className="text-base font-semibold text-title">RELINTs Recentes</h3>
        <Link href="/relints/novo"
          className="flex items-center gap-1.5 text-sm text-sigma-600 dark:text-sigma-400 hover:text-sigma-700 dark:hover:text-sigma-300 font-medium bg-sigma-50 dark:bg-sigma-900/20 px-3 py-1.5 rounded-lg hover:bg-sigma-100 dark:hover:bg-sigma-900/30 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo RELINT
        </Link>
      </div>
      <div className="card-divide">
        {relints.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-subtle text-sm">Nenhum relatório encontrado</p>
          </div>
        )}
        {relints.map((relint) => (
          <Link key={relint.id} href={`/relints/${relint.id}`}
            className="flex items-center gap-4 px-6 py-4 card-row-hover">
            <div className="w-9 h-9 icon-badge-sigma rounded-xl flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-title truncate">{relint.subject}</p>
              <p className="text-xs text-subtle mt-0.5">{relint.number} · {relint.author.name}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getClassificationColor(relint.classification)}`}>
                {relint.classification}
              </span>
              <span className="text-xs text-subtle">{formatDate(relint.createdAt)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
