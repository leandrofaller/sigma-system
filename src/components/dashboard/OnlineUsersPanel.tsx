'use client';

import { motion } from 'framer-motion';
import { Wifi } from 'lucide-react';

interface OnlineUser {
  id: string;
  name: string;
  email: string;
  lastSeenAt: string;
}

interface Props {
  users: OnlineUser[];
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min atrás`;
  return `${Math.floor(m / 60)}h atrás`;
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export function OnlineUsersPanel({ users }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 icon-badge-green rounded-xl flex items-center justify-center flex-shrink-0">
            <Wifi className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-title leading-tight">Usuários Online</p>
            <p className="text-xs text-subtle">últimos 5 minutos</p>
          </div>
        </div>
        <span className="text-2xl font-bold text-title">{users.length}</span>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-subtle text-center py-3">Nenhum usuário ativo no momento</p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-2.5">
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-sigma-100 dark:bg-sigma-900/40 text-sigma-700 dark:text-sigma-300 flex items-center justify-center text-xs font-bold">
                  {initials(u.name)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white dark:border-gray-900" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-body truncate">{u.name}</p>
                <p className="text-xs text-subtle truncate">{relTime(u.lastSeenAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
