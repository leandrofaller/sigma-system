'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Trash2, CheckSquare, Square, MessageSquare, Calendar as CalendarIcon,
  Users as UsersIcon, Send, Loader2, AlignLeft,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { BoardCard, BoardUser } from './useMissionBoard';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: BoardUser;
}

interface Props {
  card: BoardCard;
  missionId: string;
  currentUser: { id: string; name: string };
  allUsers: BoardUser[];
  onClose: () => void;
  onUpdate: (patch: Partial<BoardCard>) => void;
  onDelete: () => void;
  onAddChecklist: (text: string) => void;
  onToggleChecklist: (itemId: string, done: boolean) => void;
  onDeleteChecklist: (itemId: string) => void;
  onAddAssignee: (userId: string) => void;
  onRemoveAssignee: (userId: string) => void;
}

export function CardDetailModal(props: Props) {
  const { card, missionId, currentUser, allUsers, onClose } = props;
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [dueDate, setDueDate] = useState(card.dueDate ? card.dueDate.slice(0, 16) : '');
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Sincroniza estado local quando o card muda externamente (SSE)
  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description || '');
    setDueDate(card.dueDate ? card.dueDate.slice(0, 16) : '');
  }, [card.title, card.description, card.dueDate]);

  // Carrega comentários ao abrir + escuta SSE para novos
  useEffect(() => {
    fetch(`/api/board/cards/${card.id}`)
      .then(r => r.json())
      .then(data => setComments(data?.comments || []));

    const es = new EventSource(`/api/missions/${missionId}/board/events`);
    const onComment = (e: MessageEvent) => {
      const parsed = JSON.parse(e.data);
      if (parsed.payload?.cardId !== card.id) return;
      if (parsed.actorId === currentUser.id) return;
      setComments(prev => [...prev, parsed.payload.comment]);
    };
    const onCommentDel = (e: MessageEvent) => {
      const parsed = JSON.parse(e.data);
      if (parsed.payload?.cardId !== card.id) return;
      setComments(prev => prev.filter(c => c.id !== parsed.payload.id));
    };
    es.addEventListener('comment.created', onComment);
    es.addEventListener('comment.deleted', onCommentDel);
    return () => es.close();
  }, [card.id, missionId, currentUser.id]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const sendComment = async () => {
    if (!newComment.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/board/cards/${card.id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (res.ok) {
        const c = await res.json();
        setComments(prev => [...prev, c]);
        setNewComment('');
      }
    } finally { setSending(false); }
  };

  const deleteComment = async (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
    await fetch(`/api/board/comments/${commentId}`, { method: 'DELETE' });
  };

  const saveTitle = () => {
    if (title.trim() && title !== card.title) props.onUpdate({ title: title.trim() });
  };
  const saveDescription = () => {
    if (description !== (card.description || '')) props.onUpdate({ description });
    setEditingDesc(false);
  };
  const saveDueDate = (val: string) => {
    setDueDate(val);
    props.onUpdate({ dueDate: val ? new Date(val).toISOString() : null });
  };

  const unassigned = allUsers.filter(u => !card.assignees.find(a => a.user.id === u.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        className="relative bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90dvh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b border-gray-100 dark:border-gray-800">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="flex-1 text-lg font-bold text-title bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-sigma-300 rounded-md px-2 py-1 -ml-2"
          />
          <button onClick={onClose} className="p-1 text-subtle hover:text-body">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Quick actions row */}
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[10px] font-bold text-subtle uppercase tracking-wider ml-1 flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" /> Prazo
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={e => saveDueDate(e.target.value)}
                className="w-full input-base px-3 py-2 text-sm mt-1"
              />
            </div>
          </div>

          {/* Responsáveis */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-subtle uppercase tracking-wider flex items-center gap-1.5">
                <UsersIcon className="w-3.5 h-3.5" /> Responsáveis
              </h4>
              <button
                onClick={() => setShowAssigneePicker(!showAssigneePicker)}
                className="text-xs text-sigma-600 font-semibold"
              >
                + Adicionar
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {card.assignees.length === 0 && <span className="text-xs text-subtle italic">Ninguém atribuído</span>}
              {card.assignees.map(a => (
                <div key={a.user.id} className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                  <div className="w-5 h-5 rounded-full bg-sigma-600 text-white text-[9px] font-bold flex items-center justify-center">
                    {a.user.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-body">{a.user.name}</span>
                  <button
                    onClick={() => props.onRemoveAssignee(a.user.id)}
                    className="text-subtle hover:text-red-500"
                  ><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
            {showAssigneePicker && unassigned.length > 0 && (
              <div className="mt-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-2 max-h-40 overflow-y-auto">
                {unassigned.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { props.onAddAssignee(u.id); }}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 hover:bg-white dark:hover:bg-gray-700 rounded-md text-xs"
                  >
                    <div className="w-5 h-5 rounded-full bg-sigma-600 text-white text-[9px] font-bold flex items-center justify-center">
                      {u.name?.charAt(0).toUpperCase()}
                    </div>
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Descrição */}
          <div>
            <h4 className="text-xs font-bold text-subtle uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5" /> Descrição
            </h4>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  rows={4}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Adicione uma descrição mais detalhada…"
                  className="w-full input-base px-3 py-2 text-sm resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={saveDescription} className="bg-sigma-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Salvar</button>
                  <button onClick={() => { setDescription(card.description || ''); setEditingDesc(false); }} className="text-subtle text-xs px-2">Cancelar</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingDesc(true)}
                className="w-full text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl p-3 text-sm text-body min-h-[60px]"
              >
                {description || <span className="text-subtle italic">Adicionar descrição…</span>}
              </button>
            )}
          </div>

          {/* Checklist */}
          <div>
            <h4 className="text-xs font-bold text-subtle uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5" /> Checklist
              {card.checklist.length > 0 && (
                <span className="ml-1 text-subtle font-normal">
                  ({card.checklist.filter(it => it.done).length}/{card.checklist.length})
                </span>
              )}
            </h4>
            <div className="space-y-1">
              {card.checklist.map(item => (
                <div key={item.id} className="flex items-center gap-2 group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-md px-2 py-1.5">
                  <button
                    onClick={() => props.onToggleChecklist(item.id, !item.done)}
                    className="text-subtle hover:text-sigma-600"
                  >
                    {item.done
                      ? <CheckSquare className="w-4 h-4 text-sigma-600" />
                      : <Square className="w-4 h-4" />}
                  </button>
                  <span className={`flex-1 text-sm ${item.done ? 'line-through text-subtle' : 'text-body'}`}>
                    {item.text}
                  </span>
                  <button
                    onClick={() => props.onDeleteChecklist(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-subtle hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                value={newChecklistItem}
                onChange={e => setNewChecklistItem(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newChecklistItem.trim()) {
                    props.onAddChecklist(newChecklistItem.trim());
                    setNewChecklistItem('');
                  }
                }}
                placeholder="Novo item…"
                className="flex-1 input-base px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => {
                  if (newChecklistItem.trim()) {
                    props.onAddChecklist(newChecklistItem.trim());
                    setNewChecklistItem('');
                  }
                }}
                className="bg-sigma-600 text-white text-xs font-bold px-3 rounded-lg"
              >Adicionar</button>
            </div>
          </div>

          {/* Comentários */}
          <div>
            <h4 className="text-xs font-bold text-subtle uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> Comentários
              <span className="ml-1 text-subtle font-normal">({comments.length})</span>
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {comments.map(c => (
                <div key={c.id} className="flex gap-2 group">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-sigma-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {c.author.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span className="text-xs font-bold text-title">{c.author.name}</span>
                      <span className="text-[10px] text-subtle">
                        {format(new Date(c.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm text-body whitespace-pre-wrap break-words">{c.content}</p>
                  </div>
                  {c.author.id === currentUser.id && (
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="opacity-0 group-hover:opacity-100 text-subtle hover:text-red-500 self-start mt-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div ref={commentsEndRef} />
            </div>
          </div>
        </div>

        {/* Footer — comentário + delete */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-3">
          <div className="flex gap-2">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendComment();
                }
              }}
              placeholder="Escreva um comentário… (Enter envia)"
              rows={1}
              className="flex-1 input-base px-3 py-2 text-sm resize-none"
            />
            <button
              onClick={sendComment}
              disabled={!newComment.trim() || sending}
              className="bg-sigma-600 active:scale-95 text-white px-4 rounded-xl disabled:opacity-40 flex items-center justify-center"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { if (confirm('Excluir este card?')) props.onDelete(); }}
              className="border border-red-200 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 rounded-xl"
              title="Excluir card"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
