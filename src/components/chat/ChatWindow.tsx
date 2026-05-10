'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Users, User, Hash, Loader2, Search, Paperclip, Download, FileText, Image as ImageIcon, Trash2, SmilePlus } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

const EMOJI_LIST = ['👍', '👎', '❤️', '😂', '😮', '😢', '🔥', '✅', '👀', '🙏', '😊', '💪', '🎉', '⚠️', '❓'];

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

function FileMessage({ msg, isOwn }: { msg: any; isOwn: boolean }) {
  const isImage = msg.type === 'IMAGE';
  const fileUrl = msg.fileUrl;
  const fileName = msg.fileName || msg.content;
  const fileSize = msg.fileSize ? `${(msg.fileSize / 1024).toFixed(1)} KB` : '';

  if (isImage) {
    return (
      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={fileUrl}
          alt={fileName}
          className="max-w-xs rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
          style={{ maxHeight: 240 }}
        />
      </a>
    );
  }

  return (
    <a
      href={fileUrl}
      download={fileName}
      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors ${
        isOwn
          ? 'bg-sigma-400/30 hover:bg-sigma-400/40'
          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isOwn ? 'bg-white/20' : 'bg-sigma-100 dark:bg-sigma-900/20'
      }`}>
        <FileText className={`w-4 h-4 ${isOwn ? 'text-white' : 'text-sigma-600 dark:text-sigma-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${isOwn ? 'text-white' : 'text-body'}`}>{fileName}</p>
        {fileSize && <p className={`text-xs ${isOwn ? 'text-white/70' : 'text-subtle'}`}>{fileSize}</p>}
      </div>
      <Download className={`w-3.5 h-3.5 flex-shrink-0 ${isOwn ? 'text-white/70' : 'text-subtle'}`} />
    </a>
  );
}

export function ChatWindow({ currentUser, contacts, groups }: Props) {
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [emojiPicker, setEmojiPicker] = useState<{ msgId: string; top: number; left: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Close emoji picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPicker(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
        lastMessageRef.current = newMsgs[newMsgs.length - 1].createdAt;
        return [...prev, ...newMsgs];
      });
    }
  }, [activeChannel]);

  useEffect(() => {
    if (!activeChannel) return;
    setMessages([]);
    lastMessageRef.current = null;

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

  const uploadFile = async (file: File) => {
    if (!activeChannel) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (activeChannel.type === 'group') formData.append('groupId', activeChannel.id);
      else formData.append('receiverId', activeChannel.id);

      const res = await fetch('/api/chat/upload', { method: 'POST', body: formData });
      const msg = await res.json();
      if (res.ok) {
        setMessages((prev) => [...prev, msg]);
        lastMessageRef.current = msg.createdAt;
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const clearConversation = async () => {
    if (!activeChannel) return;
    if (!confirm('Limpar toda a conversa? Esta ação não pode ser desfeita.')) return;
    setClearing(true);
    try {
      const params = new URLSearchParams();
      if (activeChannel.type === 'group') params.set('groupId', activeChannel.id);
      else params.set('receiverId', activeChannel.id);
      await fetch(`/api/chat/messages?${params}`, { method: 'DELETE' });
      setMessages([]);
      lastMessageRef.current = null;
    } finally {
      setClearing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && activeChannel) uploadFile(file);
  };

  const openEmojiPicker = (e: React.MouseEvent<HTMLButtonElement>, msgId: string) => {
    e.stopPropagation();
    if (emojiPicker?.msgId === msgId) { setEmojiPicker(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    // Position: try to open to the left by default so it doesn't overflow right edge
    const pickerWidth = 200;
    let left = rect.left - pickerWidth / 2 + rect.width / 2;
    // Clamp to viewport
    if (left + pickerWidth > window.innerWidth - 8) left = window.innerWidth - pickerWidth - 8;
    if (left < 8) left = 8;
    setEmojiPicker({ msgId, top: rect.bottom + 6, left });
  };

  const handleToggleReaction = async (msgId: string, emoji: string) => {
    setEmojiPicker(null);
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const reactions: Record<string, string[]> = { ...(m.reactions ?? {}) };
        const users: string[] = reactions[emoji] ?? [];
        if (users.includes(currentUser.id)) {
          const remaining = users.filter((id) => id !== currentUser.id);
          if (remaining.length === 0) delete reactions[emoji];
          else reactions[emoji] = remaining;
        } else {
          reactions[emoji] = [...users, currentUser.id];
        }
        return { ...m, reactions };
      })
    );
    // Persist
    await fetch('/api/chat/reactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: msgId, emoji }),
    });
  };

  const filteredContacts = contacts.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="flex h-full card overflow-hidden relative"
      onDragOver={(e) => { e.preventDefault(); if (activeChannel) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl"
            style={{ background: 'rgba(99,102,241,0.15)', border: '2px dashed rgba(99,102,241,0.5)' }}
          >
            <ImageIcon className="w-10 h-10 text-sigma-400 mb-2" />
            <p className="text-sm font-semibold text-sigma-400">Solte o arquivo aqui</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />

      {/* Sidebar */}
      <div className="w-64 border-r border-gray-100 dark:border-gray-800 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-2 input-base text-xs" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {groups.length > 0 && (
            <>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider px-3 py-2 mt-2">Grupos</p>
              {groups.map((g) => (
                <button key={g.id} onClick={() => setActiveChannel({ type: 'group', id: g.id, name: g.name })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left
                    ${activeChannel?.id === g.id
                      ? 'bg-sigma-50 dark:bg-sigma-900/20 text-sigma-700 dark:text-sigma-400'
                      : 'text-body hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: g.color + '20' }}>
                    <Hash className="w-3.5 h-3.5" style={{ color: g.color }} />
                  </div>
                  <span className="text-sm truncate">{g.name}</span>
                </button>
              ))}
            </>
          )}
          {filteredContacts.length > 0 && (
            <>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wider px-3 py-2 mt-2">Direto</p>
              {filteredContacts.map((c) => (
                <button key={c.id} onClick={() => setActiveChannel({ type: 'direct', id: c.id, name: c.name })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left
                    ${activeChannel?.id === c.id
                      ? 'bg-sigma-50 dark:bg-sigma-900/20 text-sigma-700 dark:text-sigma-400'
                      : 'text-body hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <div className="w-7 h-7 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-body">
                    {c.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{c.name}</p>
                    <p className="text-xs text-subtle truncate">{c.group?.name}</p>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-subtle">
            <Users className="w-12 h-12 text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-sm font-medium">Selecione um canal ou contato</p>
            <p className="text-xs text-subtle mt-1">Arquivos podem ser enviados via arrastar & soltar</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="w-8 h-8 icon-badge-sigma rounded-lg flex items-center justify-center">
                {activeChannel.type === 'group' ? <Hash className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-title">{activeChannel.name}</p>
                <p className="text-xs text-subtle">{activeChannel.type === 'group' ? 'Canal de grupo' : 'Mensagem direta'}</p>
              </div>
              <div className="ml-auto">
                <button
                  onClick={clearConversation}
                  disabled={clearing || messages.length === 0}
                  title="Limpar conversa"
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Limpar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {messages.map((msg) => {
                const isOwn = msg.senderId === currentUser.id;
                const isFile = msg.type === 'FILE' || msg.type === 'IMAGE';
                const reactions = (msg.reactions ?? {}) as Record<string, string[]>;
                const hasReactions = Object.keys(reactions).length > 0;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2 items-end group/msg py-0.5 ${isOwn ? 'flex-row-reverse' : ''}`}
                  >
                    {!isOwn && (
                      <div className="w-7 h-7 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-body mb-5">
                        {msg.sender?.name?.charAt(0)}
                      </div>
                    )}

                    <div className={`max-w-[70%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                      {!isOwn && <p className="text-xs text-subtle mb-1 ml-1">{msg.sender?.name}</p>}

                      {/* Bubble row + emoji trigger */}
                      <div className={`flex items-end gap-1.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                        {isFile ? (
                          <FileMessage msg={msg} isOwn={isOwn} />
                        ) : (
                          <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
                            ${isOwn
                              ? 'bg-sigma-500 text-white rounded-tr-sm'
                              : 'bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-body rounded-tl-sm'}`}>
                            {msg.content}
                          </div>
                        )}

                        {/* Emoji trigger — appears on hover */}
                        <button
                          onClick={(e) => openEmojiPicker(e, msg.id)}
                          className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-full text-gray-300 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0 mb-0.5"
                          title="Reagir"
                        >
                          <SmilePlus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Reaction pills */}
                      {hasReactions && (
                        <div className={`flex flex-wrap gap-1 mt-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          {Object.entries(reactions).map(([emoji, users]) => (
                            <button
                              key={emoji}
                              onClick={() => handleToggleReaction(msg.id, emoji)}
                              title={`${users.length} pessoa${users.length !== 1 ? 's' : ''}`}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all hover:scale-105 ${
                                users.includes(currentUser.id)
                                  ? 'bg-sigma-50 dark:bg-sigma-900/30 border-sigma-300 dark:border-sigma-700 text-sigma-700 dark:text-sigma-300 font-medium'
                                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-body hover:bg-gray-50 dark:hover:bg-gray-700'
                              }`}
                            >
                              <span className="text-base leading-none">{emoji}</span>
                              <span>{users.length}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <span className="text-xs text-subtle mt-1">{formatDateTime(msg.createdAt)}</span>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-gray-100 dark:border-gray-800">
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="p-2.5 rounded-xl text-subtle hover:text-body hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                  title="Enviar arquivo"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Digite uma mensagem ou arraste um arquivo..."
                  className="flex-1 px-4 py-2.5 input-base" />
                <button onClick={sendMessage} disabled={!input.trim() || sending}
                  className="bg-sigma-500 hover:bg-sigma-600 disabled:opacity-40 text-white p-2.5 rounded-xl transition-colors">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Emoji picker portal */}
      {emojiPicker && typeof document !== 'undefined' && createPortal(
        <div
          ref={emojiPickerRef}
          style={{ position: 'fixed', top: emojiPicker.top, left: emojiPicker.left, zIndex: 9999 }}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-2.5"
        >
          <p className="text-xs text-subtle font-medium px-1 pb-1.5">Reagir</p>
          <div className="grid grid-cols-5 gap-0.5">
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleToggleReaction(emojiPicker.msgId, emoji)}
                className="w-9 h-9 flex items-center justify-center text-xl rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors hover:scale-110 active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
