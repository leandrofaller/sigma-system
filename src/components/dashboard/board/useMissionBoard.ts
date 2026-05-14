'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';

export interface BoardUser { id: string; name: string; avatar?: string | null }
export interface BoardChecklistItem { id: string; cardId: string; text: string; done: boolean; position: number }
export interface BoardCard {
  id: string; listId: string; title: string; description?: string | null;
  position: number; dueDate?: string | null; createdById: string;
  assignees: { user: BoardUser }[];
  checklist: BoardChecklistItem[];
  _count: { comments: number };
}
export interface BoardList {
  id: string; missionId: string; name: string; position: number; color?: string | null;
  cards: BoardCard[];
}
export interface PresenceUser { userId: string; userName: string }

export function useMissionBoard(missionId: string, currentUserId: string) {
  const [lists, setLists] = useState<BoardList[]>([]);
  const [loading, setLoading] = useState(true);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const evtRef = useRef<EventSource | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/missions/${missionId}/board`);
      if (!res.ok) throw new Error('Erro ao carregar quadro');
      const data = await res.json();
      setLists(data.lists || []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => { refetch(); }, [refetch]);

  // SSE
  useEffect(() => {
    const es = new EventSource(`/api/missions/${missionId}/board/events`);
    evtRef.current = es;

    const apply = (eventName: string) => (e: MessageEvent) => {
      let parsed: any;
      try { parsed = JSON.parse(e.data); } catch { return; }
      // ignora eventos próprios (já aplicados otimisticamente)
      if (parsed.actorId === currentUserId && eventName !== 'presence') return;

      const p = parsed.payload;
      setLists(prev => {
        switch (eventName) {
          case 'list.created':
            if (prev.find(l => l.id === p.id)) return prev;
            return [...prev, { ...p, cards: p.cards || [] }].sort((a, b) => a.position - b.position);
          case 'list.updated':
            return prev.map(l => l.id === p.id ? { ...l, ...p, cards: l.cards } : l).sort((a, b) => a.position - b.position);
          case 'list.deleted':
            return prev.filter(l => l.id !== p.id);
          case 'card.created':
            return prev.map(l => l.id === p.listId
              ? { ...l, cards: [...l.cards.filter(c => c.id !== p.id), p].sort((a, b) => a.position - b.position) }
              : l);
          case 'card.updated':
          case 'card.moved':
            return prev.map(l => ({
              ...l,
              cards: l.id === p.listId
                ? [...l.cards.filter(c => c.id !== p.id), p].sort((a, b) => a.position - b.position)
                : l.cards.filter(c => c.id !== p.id),
            }));
          case 'card.deleted':
            return prev.map(l => ({ ...l, cards: l.cards.filter(c => c.id !== p.id) }));
          case 'checklist.created':
            return prev.map(l => ({
              ...l,
              cards: l.cards.map(c => c.id === p.cardId
                ? { ...c, checklist: [...c.checklist, p.item].sort((a, b) => a.position - b.position) }
                : c),
            }));
          case 'checklist.updated':
            return prev.map(l => ({
              ...l,
              cards: l.cards.map(c => c.id === p.cardId
                ? { ...c, checklist: c.checklist.map(it => it.id === p.item.id ? p.item : it) }
                : c),
            }));
          case 'checklist.deleted':
            return prev.map(l => ({
              ...l,
              cards: l.cards.map(c => c.id === p.cardId
                ? { ...c, checklist: c.checklist.filter(it => it.id !== p.id) }
                : c),
            }));
          case 'comment.created':
            return prev.map(l => ({
              ...l,
              cards: l.cards.map(c => c.id === p.cardId
                ? { ...c, _count: { comments: c._count.comments + 1 } }
                : c),
            }));
          case 'comment.deleted':
            return prev.map(l => ({
              ...l,
              cards: l.cards.map(c => c.id === p.cardId
                ? { ...c, _count: { comments: Math.max(0, c._count.comments - 1) } }
                : c),
            }));
          case 'assignee.added':
            return prev.map(l => ({
              ...l,
              cards: l.cards.map(c => c.id === p.cardId
                ? { ...c, assignees: c.assignees.some(a => a.user.id === p.user.id) ? c.assignees : [...c.assignees, { user: p.user }] }
                : c),
            }));
          case 'assignee.removed':
            return prev.map(l => ({
              ...l,
              cards: l.cards.map(c => c.id === p.cardId
                ? { ...c, assignees: c.assignees.filter(a => a.user.id !== p.userId) }
                : c),
            }));
          default:
            return prev;
        }
      });
    };

    const presenceHandler = (e: MessageEvent) => {
      const parsed = JSON.parse(e.data);
      if (parsed.actorId === currentUserId) return;
      setPresence(prev => {
        const without = prev.filter(u => u.userId !== parsed.payload.userId);
        return parsed.payload.online
          ? [...without, { userId: parsed.payload.userId, userName: parsed.payload.userName }]
          : without;
      });
    };

    [
      'list.created', 'list.updated', 'list.deleted',
      'card.created', 'card.updated', 'card.deleted', 'card.moved',
      'checklist.created', 'checklist.updated', 'checklist.deleted',
      'comment.created', 'comment.deleted',
      'assignee.added', 'assignee.removed',
    ].forEach(name => es.addEventListener(name, apply(name)));

    es.addEventListener('presence', presenceHandler);

    es.onerror = () => {
      // reconecta automaticamente; só logamos
      console.warn('[SSE] connection error, browser will retry');
    };

    return () => { es.close(); evtRef.current = null; };
  }, [missionId, currentUserId]);

  // ============= Mutations otimistas =============

  const createList = async (name: string) => {
    try {
      const res = await fetch(`/api/missions/${missionId}/board`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Erro ao criar lista');
      const list = await res.json();
      setLists(prev => [...prev, { ...list, cards: [] }].sort((a, b) => a.position - b.position));
    } catch (e: any) { toast.error(e.message); }
  };

  const renameList = async (id: string, name: string) => {
    setLists(prev => prev.map(l => l.id === id ? { ...l, name } : l));
    await fetch(`/api/board/lists/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  };

  const deleteList = async (id: string) => {
    setLists(prev => prev.filter(l => l.id !== id));
    await fetch(`/api/board/lists/${id}`, { method: 'DELETE' });
  };

  const createCard = async (listId: string, title: string) => {
    try {
      const res = await fetch(`/api/board/lists/${listId}/cards`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error('Erro ao criar card');
      const card = await res.json();
      setLists(prev => prev.map(l => l.id === listId ? { ...l, cards: [...l.cards, card] } : l));
    } catch (e: any) { toast.error(e.message); }
  };

  const updateCard = async (cardId: string, patch: Partial<BoardCard>) => {
    setLists(prev => prev.map(l => ({
      ...l,
      cards: l.cards.map(c => c.id === cardId ? { ...c, ...patch } : c),
    })));
    await fetch(`/api/board/cards/${cardId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  };

  const deleteCard = async (cardId: string) => {
    setLists(prev => prev.map(l => ({ ...l, cards: l.cards.filter(c => c.id !== cardId) })));
    await fetch(`/api/board/cards/${cardId}`, { method: 'DELETE' });
  };

  // Move card: aplica otimisticamente e calcula nova posição
  const moveCard = async (cardId: string, toListId: string, toIndex: number) => {
    let movedCard: BoardCard | null = null;
    let newPosition = 0;

    setLists(prev => {
      // Remove
      const without = prev.map(l => {
        const found = l.cards.find(c => c.id === cardId);
        if (found && !movedCard) movedCard = found;
        return { ...l, cards: l.cards.filter(c => c.id !== cardId) };
      });
      if (!movedCard) return prev;

      // Calcula posição nova baseada nos vizinhos
      const target = without.find(l => l.id === toListId);
      if (!target) return prev;
      const before = target.cards[toIndex - 1];
      const after = target.cards[toIndex];
      if (!before && !after) newPosition = 0;
      else if (!before) newPosition = after!.position - 1;
      else if (!after) newPosition = before.position + 1;
      else newPosition = (before.position + after.position) / 2;

      const updatedCard = { ...movedCard, listId: toListId, position: newPosition };
      return without.map(l => l.id === toListId
        ? { ...l, cards: [...l.cards.slice(0, toIndex), updatedCard, ...l.cards.slice(toIndex)] }
        : l);
    });

    await fetch(`/api/board/cards/${cardId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: toListId, position: newPosition }),
    });
  };

  const addChecklistItem = async (cardId: string, text: string) => {
    const res = await fetch(`/api/board/cards/${cardId}/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const item = await res.json();
    setLists(prev => prev.map(l => ({
      ...l,
      cards: l.cards.map(c => c.id === cardId ? { ...c, checklist: [...c.checklist, item] } : c),
    })));
  };

  const toggleChecklist = async (itemId: string, cardId: string, done: boolean) => {
    setLists(prev => prev.map(l => ({
      ...l,
      cards: l.cards.map(c => c.id === cardId
        ? { ...c, checklist: c.checklist.map(it => it.id === itemId ? { ...it, done } : it) }
        : c),
    })));
    await fetch(`/api/board/checklist/${itemId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    });
  };

  const deleteChecklistItem = async (itemId: string, cardId: string) => {
    setLists(prev => prev.map(l => ({
      ...l,
      cards: l.cards.map(c => c.id === cardId
        ? { ...c, checklist: c.checklist.filter(it => it.id !== itemId) }
        : c),
    })));
    await fetch(`/api/board/checklist/${itemId}`, { method: 'DELETE' });
  };

  const addAssignee = async (cardId: string, userId: string) => {
    const res = await fetch(`/api/board/cards/${cardId}/assignees`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) return;
    const u = await res.json();
    setLists(prev => prev.map(l => ({
      ...l,
      cards: l.cards.map(c => c.id === cardId
        ? { ...c, assignees: c.assignees.some(a => a.user.id === u.id) ? c.assignees : [...c.assignees, { user: u }] }
        : c),
    })));
  };

  const removeAssignee = async (cardId: string, userId: string) => {
    setLists(prev => prev.map(l => ({
      ...l,
      cards: l.cards.map(c => c.id === cardId
        ? { ...c, assignees: c.assignees.filter(a => a.user.id !== userId) }
        : c),
    })));
    await fetch(`/api/board/cards/${cardId}/assignees?userId=${userId}`, { method: 'DELETE' });
  };

  return {
    lists, loading, presence, refetch,
    createList, renameList, deleteList,
    createCard, updateCard, deleteCard, moveCard,
    addChecklistItem, toggleChecklist, deleteChecklistItem,
    addAssignee, removeAssignee,
  };
}
