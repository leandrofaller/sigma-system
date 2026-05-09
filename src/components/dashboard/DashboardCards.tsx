'use client';

import { motion } from 'framer-motion';
import { FileText, CheckCircle, Clock, Users, Inbox, TrendingUp } from 'lucide-react';

interface Props {
  totalRelints: number;
  publishedRelints: number;
  draftRelints: number;
  totalUsers: number;
  receivedRelints: number;
  role: string;
}

export function DashboardCards({ totalRelints, publishedRelints, draftRelints, totalUsers, receivedRelints, role }: Props) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const cards = [
    { title: 'Total RELINTs',      value: totalRelints,     icon: FileText,     badge: 'icon-badge-blue',   trend: '+12%' },
    { title: 'Publicados',         value: publishedRelints, icon: CheckCircle,  badge: 'icon-badge-green',  trend: '+8%'  },
    { title: 'Rascunhos',          value: draftRelints,     icon: Clock,        badge: 'icon-badge-yellow', trend: ''     },
    { title: 'RELINTs Recebidos',  value: receivedRelints,  icon: Inbox,        badge: 'icon-badge-purple', trend: ''     },
    ...(isAdmin ? [{ title: 'Usuários Ativos', value: totalUsers, icon: Users,  badge: 'icon-badge-sigma',  trend: ''     }] : []),
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="card p-5 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-4">
            <div className={`w-10 h-10 ${card.badge} rounded-xl flex items-center justify-center`}>
              <card.icon className="w-5 h-5" />
            </div>
            {card.trend && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                <TrendingUp className="w-3 h-3" /> {card.trend}
              </span>
            )}
          </div>
          <p className="text-3xl font-bold text-title">{card.value}</p>
          <p className="text-sm text-subtle mt-1">{card.title}</p>
        </motion.div>
      ))}
    </div>
  );
}
