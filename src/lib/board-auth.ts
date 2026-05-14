import { prisma } from './db';

// Verifica se o usuário pode acessar o quadro de uma missão.
// Regra: dono da missão, mesmo grupo da missão, ou ADMIN/SUPER_ADMIN.
export async function canAccessMissionBoard(
  missionId: string,
  user: { id: string; role: string; groupId?: string | null }
): Promise<{ ok: true; mission: { id: string; userId: string; groupId: string | null; title: string } } | { ok: false; status: number; error: string }> {
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { id: true, userId: true, groupId: true, title: true },
  });
  if (!mission) return { ok: false, status: 404, error: 'Missão não encontrada' };

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const isOwner = mission.userId === user.id;
  const sameGroup = !!mission.groupId && mission.groupId === user.groupId;
  if (!isAdmin && !isOwner && !sameGroup) {
    return { ok: false, status: 403, error: 'Acesso negado a este quadro' };
  }
  return { ok: true, mission };
}

// Resolve a missionId a partir de uma listId / cardId / checklistItemId / commentId
// para validação de permissão em endpoints aninhados.
export async function missionIdFromList(listId: string): Promise<string | null> {
  const list = await prisma.boardList.findUnique({ where: { id: listId }, select: { missionId: true } });
  return list?.missionId ?? null;
}

export async function missionIdFromCard(cardId: string): Promise<string | null> {
  const card = await prisma.boardCard.findUnique({
    where: { id: cardId },
    select: { list: { select: { missionId: true } } },
  });
  return card?.list?.missionId ?? null;
}

export async function missionIdFromChecklist(itemId: string): Promise<string | null> {
  const item = await prisma.boardChecklistItem.findUnique({
    where: { id: itemId },
    select: { card: { select: { list: { select: { missionId: true } } } } },
  });
  return item?.card?.list?.missionId ?? null;
}

export async function missionIdFromComment(commentId: string): Promise<string | null> {
  const c = await prisma.boardComment.findUnique({
    where: { id: commentId },
    select: { card: { select: { list: { select: { missionId: true } } } } },
  });
  return c?.card?.list?.missionId ?? null;
}
