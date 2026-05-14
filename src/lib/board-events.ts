// Pub/sub in-memory para eventos do quadro de missão.
// OK para single-instance (Coolify normalmente roda 1 container Next).
// Para multi-instance, trocar por Redis pub/sub ou serviço externo.

export type BoardEvent =
  | { type: 'list.created' | 'list.updated' | 'list.deleted'; missionId: string; payload: any; actorId: string }
  | { type: 'card.created' | 'card.updated' | 'card.deleted' | 'card.moved'; missionId: string; payload: any; actorId: string }
  | { type: 'checklist.created' | 'checklist.updated' | 'checklist.deleted'; missionId: string; payload: any; actorId: string }
  | { type: 'comment.created' | 'comment.deleted'; missionId: string; payload: any; actorId: string }
  | { type: 'assignee.added' | 'assignee.removed'; missionId: string; payload: any; actorId: string }
  | { type: 'presence'; missionId: string; payload: { userId: string; userName: string; online: boolean }; actorId: string };

type Listener = (event: BoardEvent) => void;

// Map<missionId, Set<Listener>>
const subscribers = new Map<string, Set<Listener>>();

export function subscribe(missionId: string, listener: Listener): () => void {
  let set = subscribers.get(missionId);
  if (!set) {
    set = new Set();
    subscribers.set(missionId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) subscribers.delete(missionId);
  };
}

export function publish(event: BoardEvent): void {
  const set = subscribers.get(event.missionId);
  if (!set) return;
  set.forEach(listener => {
    try {
      listener(event);
    } catch (err) {
      // não deixa um listener quebrado afetar os outros
      console.error('[board-events] listener error', err);
    }
  });
}

export function subscriberCount(missionId: string): number {
  return subscribers.get(missionId)?.size ?? 0;
}
