'use client';

import { useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent, PointerSensor, TouchSensor,
  useSensor, useSensors, closestCorners, DragOverlay,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, X, MoreHorizontal, Trash2, MessageSquare, CheckSquare,
  Calendar as CalendarIcon, Users as UsersIcon,
} from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMissionBoard, type BoardCard, type BoardList, type BoardUser } from './useMissionBoard';
import { CardDetailModal } from './CardDetailModal';

interface Props {
  missionId: string;
  missionTitle: string;
  currentUser: { id: string; name: string };
  allUsers: BoardUser[];
}

export function MissionBoard({ missionId, missionTitle, currentUser, allUsers }: Props) {
  const board = useMissionBoard(missionId, currentUser.id);
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [addingListName, setAddingListName] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const findContainer = (id: string): string | null => {
    if (board.lists.some(l => l.id === id)) return id;
    for (const list of board.lists) if (list.cards.some(c => c.id === id)) return list.id;
    return null;
  };

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    for (const list of board.lists) {
      const card = list.cards.find(c => c.id === id);
      if (card) { setActiveCard(card); return; }
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveCard(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;

    const fromList = findContainer(activeId);
    const toList = findContainer(overId);
    if (!fromList || !toList) return;

    const targetList = board.lists.find(l => l.id === toList)!;
    let toIndex = targetList.cards.findIndex(c => c.id === overId);
    if (toIndex === -1) toIndex = targetList.cards.length; // dropou na lista vazia
    board.moveCard(activeId, toList, toIndex);
  };

  const openCard = board.lists.flatMap(l => l.cards).find(c => c.id === openCardId);

  return (
    <div className="flex flex-col h-full">
      {/* Header com presença */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h2 className="text-xl font-bold text-title leading-tight">{missionTitle}</h2>
          <p className="text-xs text-subtle mt-0.5">Quadro de Acompanhamento</p>
        </div>
        {board.presence.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-subtle uppercase tracking-wider font-bold">Online agora</span>
            <div className="flex -space-x-2">
              {board.presence.slice(0, 5).map(p => (
                <div
                  key={p.userId}
                  title={p.userName}
                  className="w-7 h-7 rounded-full bg-sigma-600 text-white text-xs font-bold flex items-center justify-center border-2 border-white dark:border-gray-900 ring-2 ring-green-400"
                >
                  {p.userName?.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quadro */}
      {board.loading ? (
        <div className="flex-1 flex items-center justify-center text-subtle">Carregando quadro…</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
            <div className="flex gap-3 h-full items-start min-w-max">
              {board.lists.map(list => (
                <ListColumn
                  key={list.id}
                  list={list}
                  onCardClick={setOpenCardId}
                  onAddCard={(title) => board.createCard(list.id, title)}
                  onRenameList={(name) => board.renameList(list.id, name)}
                  onDeleteList={() => {
                    if (confirm(`Excluir a lista "${list.name}" e todos seus cards?`)) board.deleteList(list.id);
                  }}
                />
              ))}

              {/* Adicionar nova lista */}
              <div className="w-72 flex-shrink-0">
                {addingListName !== null ? (
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-3 space-y-2">
                    <input
                      autoFocus
                      placeholder="Nome da lista"
                      value={addingListName}
                      onChange={e => setAddingListName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && addingListName.trim()) {
                          board.createList(addingListName.trim());
                          setAddingListName(null);
                        }
                        if (e.key === 'Escape') setAddingListName(null);
                      }}
                      className="w-full input-base px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (addingListName.trim()) {
                            board.createList(addingListName.trim());
                            setAddingListName(null);
                          }
                        }}
                        className="bg-sigma-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
                      >Adicionar</button>
                      <button onClick={() => setAddingListName(null)} className="text-subtle text-xs px-2">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingListName('')}
                    className="w-full bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl py-3 text-sm font-semibold text-subtle hover:text-body transition flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Adicionar lista
                  </button>
                )}
              </div>
            </div>
          </div>

          <DragOverlay>
            {activeCard && <CardItem card={activeCard} dragging />}
          </DragOverlay>
        </DndContext>
      )}

      {openCard && (
        <CardDetailModal
          card={openCard}
          missionId={missionId}
          currentUser={currentUser}
          allUsers={allUsers}
          onClose={() => setOpenCardId(null)}
          onUpdate={(patch) => board.updateCard(openCard.id, patch)}
          onDelete={() => { board.deleteCard(openCard.id); setOpenCardId(null); }}
          onAddChecklist={(text) => board.addChecklistItem(openCard.id, text)}
          onToggleChecklist={(itemId, done) => board.toggleChecklist(itemId, openCard.id, done)}
          onDeleteChecklist={(itemId) => board.deleteChecklistItem(itemId, openCard.id)}
          onAddAssignee={(userId) => board.addAssignee(openCard.id, userId)}
          onRemoveAssignee={(userId) => board.removeAssignee(openCard.id, userId)}
        />
      )}
    </div>
  );
}

// ===================== Lista (coluna) =====================
function ListColumn({
  list, onCardClick, onAddCard, onRenameList, onDeleteList,
}: {
  list: BoardList;
  onCardClick: (cardId: string) => void;
  onAddCard: (title: string) => void;
  onRenameList: (name: string) => void;
  onDeleteList: () => void;
}) {
  const { setNodeRef } = useSortable({ id: list.id, data: { type: 'list' } });
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className="w-72 flex-shrink-0 bg-gray-100 dark:bg-gray-800/60 rounded-2xl p-2 flex flex-col max-h-full"
    >
      {/* Header da lista */}
      <div className="flex items-center justify-between px-2 py-1.5 mb-1">
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={() => { if (renameValue.trim()) onRenameList(renameValue.trim()); setRenaming(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { if (renameValue.trim()) onRenameList(renameValue.trim()); setRenaming(false); }
              if (e.key === 'Escape') { setRenameValue(list.name); setRenaming(false); }
            }}
            className="flex-1 input-base px-2 py-1 text-sm font-bold"
          />
        ) : (
          <button
            onClick={() => setRenaming(true)}
            className="flex items-center gap-2 text-sm font-bold text-title flex-1 text-left truncate"
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: list.color || '#6172f3' }} />
            <span className="truncate">{list.name}</span>
            <span className="text-xs text-subtle font-normal">{list.cards.length}</span>
          </button>
        )}
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-1 text-subtle hover:text-body rounded-md">
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 py-1 min-w-[160px]">
                <button onClick={() => { setRenaming(true); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800">Renomear</button>
                <button onClick={() => { onDeleteList(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                  <Trash2 className="w-3 h-3" /> Excluir lista
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cards */}
      <SortableContext items={list.cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto space-y-2 px-1 min-h-[40px]">
          {list.cards.map(card => (
            <SortableCardItem key={card.id} card={card} onClick={() => onCardClick(card.id)} />
          ))}
        </div>
      </SortableContext>

      {/* Adicionar card */}
      {adding ? (
        <div className="mt-2 space-y-2">
          <textarea
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (newTitle.trim()) { onAddCard(newTitle.trim()); setNewTitle(''); }
              }
              if (e.key === 'Escape') setAdding(false);
            }}
            placeholder="Título do card…"
            rows={2}
            className="w-full input-base px-3 py-2 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { if (newTitle.trim()) { onAddCard(newTitle.trim()); setNewTitle(''); } }}
              className="bg-sigma-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
            >Adicionar card</button>
            <button onClick={() => { setAdding(false); setNewTitle(''); }} className="text-subtle text-xs px-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 w-full text-left text-xs font-semibold text-subtle hover:text-body hover:bg-white/60 dark:hover:bg-gray-700/40 px-3 py-2 rounded-lg flex items-center gap-1.5 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar card
        </button>
      )}
    </div>
  );
}

// ===================== Card sortable =====================
function SortableCardItem({ card, onClick }: { card: BoardCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id, data: { type: 'card', listId: card.listId },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardItem card={card} onClick={onClick} />
    </div>
  );
}

// ===================== Card visual =====================
function CardItem({ card, onClick, dragging = false }: { card: BoardCard; onClick?: () => void; dragging?: boolean }) {
  const checklistDone = card.checklist.filter(it => it.done).length;
  const checklistTotal = card.checklist.length;
  const overdue = card.dueDate && isPast(new Date(card.dueDate)) && !isToday(new Date(card.dueDate));
  const dueToday = card.dueDate && isToday(new Date(card.dueDate));

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-sm hover:shadow-md transition cursor-pointer touch-none ${dragging ? 'rotate-2 shadow-2xl ring-2 ring-sigma-400' : ''}`}
    >
      <p className="text-sm font-medium text-title leading-snug">{card.title}</p>

      {/* Indicadores */}
      {(card.dueDate || checklistTotal > 0 || card._count.comments > 0 || card.assignees.length > 0) && (
        <div className="flex items-center justify-between mt-2 gap-2">
          <div className="flex items-center gap-3 text-[11px] text-subtle">
            {card.dueDate && (
              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium ${
                overdue ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                dueToday ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400' :
                ''
              }`}>
                <CalendarIcon className="w-3 h-3" />
                {format(new Date(card.dueDate), "dd MMM", { locale: ptBR })}
              </span>
            )}
            {checklistTotal > 0 && (
              <span className={`flex items-center gap-1 ${checklistDone === checklistTotal ? 'text-green-600 dark:text-green-400' : ''}`}>
                <CheckSquare className="w-3 h-3" /> {checklistDone}/{checklistTotal}
              </span>
            )}
            {card._count.comments > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> {card._count.comments}
              </span>
            )}
          </div>
          {card.assignees.length > 0 && (
            <div className="flex -space-x-1.5">
              {card.assignees.slice(0, 3).map(a => (
                <div
                  key={a.user.id}
                  title={a.user.name}
                  className="w-5 h-5 rounded-full bg-sigma-600 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white dark:border-gray-900"
                >
                  {a.user.name?.charAt(0).toUpperCase()}
                </div>
              ))}
              {card.assignees.length > 3 && (
                <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-[9px] font-bold flex items-center justify-center border-2 border-white dark:border-gray-900">
                  +{card.assignees.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
