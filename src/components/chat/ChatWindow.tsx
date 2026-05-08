'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Users, User, Hash, Loader2, Search } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Contact {
  id: string;
  name: string;
  email: string;
  role: string;
  group?: { name: string } | null;
  lastLogin?: Date | null;
}

interface Props {
  currentUser: { id: string; name?: string; role: string };
  contacts: Contact[];
  groups: any[];
}

type Channel =
  | { type: 'group'; id: string; name: string }
  | { type: 'direct'; id: string; name: string };

export function ChatWindow({ currentUser, contacts, groups }: Props) {
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageRef = useRef<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!activeChannel) return;
    const params = new URLSearchParams();
    if (activeChannel.type === 'group') params.set('groupId', activeChannel.id);
    else params.set('receiverId', activeChannel.id);
    if (lastMessageRef.current) params.set('since', lastMessageRef.current);

    const res = await fetch(`/api/chat/messages?${params}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m: any) => m.id));
        const newMsgs = data.filter((m: any) => !existingIds.has(m.id));
        if (newMsgs.length === 0) return prev;
        const last = newMsgs[newMsgs.length - 1];
        lastMessageRef.current = last.createdAt;
        return [...prev, ...newMsgs];
      });
    }
  }, [activeChannel]);

  useEffect(() => {
    if (!activeChannel) return;
    setMessages([]);
    lastMessageRef.current = null;

    // Fetch initial messages (no 'since' filter)
    const params = new URLSearchParams();
    if (activeChannel.type === 'group') params.set('groupId', activeChannel.id);
    else params.set('receiverId', activeChannel.id);

    fetch(`/api/chat/messages?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages(data);
          if (data.length > 0) lastMessageRef.current = data[data.length - 1].createdAt;
        }
      });

    // Poll for new messages every 3s
    pollRef.current = setInterval(fetchMessages, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !activeChannel || sending) return;
    setSending(true);
    try {
      const body: any = { content: input.trim() };
      if (activeChannel.type === 'group') body.groupId = activeChannel.id;
      else body.receiverId = activeChannel.id;

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setInput('');
      lastMessageRef.current = msg.createdAt;
    } finally {
      setSending(false);
    }
  };

  const filteredContacts = contacts.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-100 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-gray-50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs focus:outline-none focus:border-sigma-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Groups */}
          {groups.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2 mt-2">Grupos</p>
              {groups.map((g) => (
                <button key={g.id} onClick={() => setActiveChannel({ type: 'group', id: g.id, name: g.name })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left
                    ${activeChannel?.id === g.id ? 'bg-sigma-50 text-sigma-700' : 'text-gray-700'}`}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: g.color + '20' }}>
                    <Hash className="w-3.5 h-3.5" style={{ color: g.color }} />
                  </div>
                  <span className="text-sm truncate">{g.name}</span>
                </button>
              ))}
            </>
          )}
          {/* Direct messages */}
          {filteredContacts.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2 mt-2">Direto</p>
              {filteredContacts.map((c) => (
                <button key={c.id} onClick={() => setActiveChannel({ type: 'direct', id: c.id, name: c.name })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left
                    ${activeChannel?.id === c.id ? 'bg-sigma-50 text-sigma-700' : 'text-gray-700'}`}>
                  <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-500">
                    {c.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.group?.name}</p>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {!activeChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Users className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-sm font-medium">Selecione um canal ou contato</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <div className="w-8 h-8 bg-sigma-50 rounded-lg flex items-center justify-center">
                {activeChannel.type === 'group' ? <Hash className="w-4 h-4 text-sigma-500" /> : <User className="w-4 h-4 text-sigma-500" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{activeChannel.name}</p>
                <p className="text-xs text-gray-400">{activeChannel.type === 'group' ? 'Canal de grupo' : 'Mensagem direta'}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => {
                const isOwn = msg.senderId === currentUser.id;
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    {!isOwn && (
                      <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-500 mt-0.5">
                        {msg.sender?.name?.charAt(0)}
                      </div>
                    )}
                    <div className={`max-w-[70%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                      {!isOwn && <p className="text-xs text-gray-400 mb-1 ml-1">{msg.sender?.name}</p>}
                      <div className={`rounded-2xl px-3.5 py-2.5 text-sm
                        ${isOwn ? 'bg-sigma-500 text-white rounded-tr-sm' : 'bg-gray-50 border border-gray-100 text-gray-700 rounded-tl-sm'}`}>
                        {msg.content}
                      </div>
                      <span className="text-xs text-gray-400 mt-1">{formatDateTime(msg.createdAt)}</span>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-gray-100">
              <div className="flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:border-sigma-400 focus:bg-white transition-all" />
                <button onClick={sendMessage} disabled={!input.trim() || sending}
                  className="bg-sigma-500 hover:bg-sigma-600 disabled:opacity-40 text-white p-2.5 rounded-xl transition-colors">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
