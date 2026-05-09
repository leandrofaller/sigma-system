'use client';

import { useState } from 'react';
import { Users, ClipboardList } from 'lucide-react';
import { UsersTable } from './UsersTable';
import { AccessRequestsPanel } from './AccessRequestsPanel';

interface Props {
  users: any[];
  groups: any[];
  requests: any[];
  currentUserRole: string;
  pendingCount: number;
}

export function AdminUsersTabs({ users, groups, requests, currentUserRole, pendingCount }: Props) {
  const [tab, setTab] = useState<'users' | 'requests'>('users');

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'users'
              ? 'border-sigma-500 text-sigma-600 dark:text-sigma-400'
              : 'border-transparent text-subtle hover:text-body'
          }`}
        >
          <Users className="w-4 h-4" />
          Usuários
        </button>
        <button
          onClick={() => setTab('requests')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'requests'
              ? 'border-sigma-500 text-sigma-600 dark:text-sigma-400'
              : 'border-transparent text-subtle hover:text-body'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Solicitações de Acesso
          {pendingCount > 0 && (
            <span className="ml-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'users' ? (
        <UsersTable users={users} groups={groups} currentUserRole={currentUserRole} />
      ) : (
        <AccessRequestsPanel requests={requests} groups={groups} />
      )}
    </div>
  );
}
