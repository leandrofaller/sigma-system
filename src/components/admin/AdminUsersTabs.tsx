'use client';

import { useState } from 'react';
import { Users, ClipboardList, ScanFace } from 'lucide-react';
import { UsersTable } from './UsersTable';
import { AccessRequestsPanel } from './AccessRequestsPanel';
import { FaceAdminPanel } from './FaceAdminPanel';

interface Props {
  users: any[];
  groups: any[];
  requests: any[];
  currentUserRole: string;
  currentUserId: string;
  pendingCount: number;
}

type Tab = 'users' | 'requests' | 'face';

export function AdminUsersTabs({ users, groups, requests, currentUserRole, currentUserId, pendingCount }: Props) {
  const [tab, setTab] = useState<Tab>('users');
  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';

  const tabs = [
    { key: 'users' as Tab,    icon: <Users className="w-4 h-4" />,         label: 'Usuários',               badge: null },
    { key: 'requests' as Tab, icon: <ClipboardList className="w-4 h-4" />, label: 'Solicitações de Acesso',  badge: pendingCount > 0 ? pendingCount : null },
    // Aba de face visível apenas para SUPER_ADMIN
    ...(isSuperAdmin ? [{
      key: 'face' as Tab,
      icon: <ScanFace className="w-4 h-4" />,
      label: 'Reconhecimento Facial',
      badge: null,
    }] : []),
  ];

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-gray-200 dark:border-gray-700">
        {tabs.map(({ key, icon, label, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? 'border-sigma-500 text-sigma-600 dark:text-sigma-400'
                : 'border-transparent text-subtle hover:text-body'
            }`}
          >
            {icon}
            {label}
            {badge !== null && (
              <span className="ml-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <UsersTable
          users={users}
          groups={groups}
          currentUserRole={currentUserRole}
          currentUserId={currentUserId}
        />
      )}

      {tab === 'requests' && (
        <AccessRequestsPanel requests={requests} groups={groups} />
      )}

      {tab === 'face' && isSuperAdmin && (
        <FaceAdminPanel />
      )}
    </div>
  );
}
