import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs';
import { getApenadosDir, getApenadoPhotoPath } from '@/lib/storage';
import { getExactDupState, startExactDupJob } from '@/lib/exact-duplicates-job';

// GET — retorna estado do job + grupos enriquecidos com dados do DB quando concluído
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const jobState = getExactDupState();

  if (jobState.isRunning || !jobState.result) {
    return NextResponse.json({
      isRunning: jobState.isRunning,
      current: jobState.current,
      total: jobState.total,
      error: jobState.error,
      result: null,
    });
  }

  const raw = jobState.result;
  const allIds = raw.groups.flat();

  if (allIds.length === 0) {
    return NextResponse.json({
      isRunning: false,
      current: jobState.current,
      total: jobState.total,
      error: jobState.error,
      result: {
        groups: [],
        totalFiles: raw.totalFiles,
        totalGroups: 0,
        errors: raw.errors,
        method: 'nodejs',
      },
    });
  }

  const apenados = await prisma.apenado.findMany({
    where: { id: { in: allIds } },
    select: { id: true, name: true, matricula: true, unidade: true, faccao: true, photoPath: true },
  });

  const map = new Map(apenados.map((a) => [a.id, a]));
  const enrichedGroups = raw.groups
    .map((ids) => ids.map((id) => map.get(id)).filter(Boolean))
    .filter((g) => g.length >= 2);

  return NextResponse.json({
    isRunning: false,
    current: jobState.current,
    total: jobState.total,
    error: jobState.error,
    result: {
      groups: enrichedGroups,
      totalFiles: raw.totalFiles,
      totalGroups: enrichedGroups.length,
      errors: raw.errors,
      method: 'nodejs',
    },
  });
}

// POST — inicia o job em background
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const jobState = getExactDupState();
  if (jobState.isRunning) {
    return NextResponse.json({ error: 'Verificação já em andamento.' }, { status: 409 });
  }

  startExactDupJob(getApenadosDir());
  return NextResponse.json({ started: true });
}

// DELETE — exclui registros duplicados enviados pelo frontend
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const idsToDelete: string[] = Array.isArray(body.idsToDelete) ? body.idsToDelete : [];
  if (idsToDelete.length === 0) {
    return NextResponse.json({ error: 'Nenhum ID informado' }, { status: 400 });
  }

  const apenados = await prisma.apenado.findMany({
    where: { id: { in: idsToDelete } },
    select: { id: true, photoPath: true },
  });

  await Promise.allSettled(
    apenados
      .filter((a) => a.photoPath)
      .map(
        (a) =>
          new Promise<void>((res) => {
            unlink(getApenadoPhotoPath(a.photoPath!), () => res());
          }),
      ),
  );

  const result = await prisma.apenado.deleteMany({ where: { id: { in: idsToDelete } } });

  return NextResponse.json({ deleted: result.count });
}
