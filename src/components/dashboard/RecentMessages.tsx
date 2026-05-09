'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Props {
  userId: string;
}

export function RecentMessages({ userId }: Props) {
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/chat/messages?since=${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`)
      .then((r) => r.json())
      .then((data) => setMessages(Array.isArray(data) ? data.slice(0, 5) : []))
      .catch(() => {});
  }, []);

  return (
    <div className="card h-full">
      <div className="flex items-center justify-between p-6 card-header">
        <h3 className="text-base font-semibold text-title">Mensagens Recentes</h3>
        <Link href="/chat" className="text-xs text-sigma-600 dark:text-sigma-400 hover:underline">Ver todas</Link>
      </div>
      <div className="card-divide max-h-64 overflow-y-auto">
        {messages.length === 0 && (
          <div className="py-8 text-center">
            <MessageSquare className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
            <p className="text-subtle text-xs">Nenhuma mensagem recente</p>
          </div>
        )}
        {messages.map((msg) => (
          <Link key={msg.id} href="/chat"
            className="flex items-start gap-3 px-4 py-3 card-row-hover">
            <div className="w-7 h-7 icon-badge-sigma rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold">
              {msg.sender?.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-title">{msg.sender?.name}</p>
              <p className="text-xs text-subtle truncate mt-0.5">{msg.content}</p>
            </div>
            <span className="text-xs text-subtle flex-shrink-0">{formatDateTime(msg.createdAt)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
