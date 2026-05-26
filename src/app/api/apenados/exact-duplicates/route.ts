import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs';
import { getApenadoPhotoPath } from '@/lib/storage';
import { getExactDupState, startExactDupJob } from '@/lib/exact-duplicates-job';

// GET — estado do job + grupos duplicados via DB GROUP BY (instantâneo após indexação)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const jobState = getExactDupState();

  if (jobState.isRunning) {
    return NextResponse.json({
      isRunning: true,
      current: jobState.current,
      total: jobState.total,
      error: '',
      result: null,
    });
  }

  // Consulta DB para grupos com hash idêntico — O(n) com índice em photoHashSha
  const dupHashes = await prisma.$queryRaw<{ photoHashSha: string }[]>`
    SELECT "photoHashSha"
    FROM apenados
    WHERE "photoHashSha" IS NOT NULL
    GROUP BY "photoHashSha"
    HAVING COUNT(*) > 1
  `;

  const [totalIndexed] = await Promise.all([
    prisma.apenado.count({ where: { photoHashSha: { not: null } } }),
  ]);

  if (dupHashes.length === 0) {
    return NextResponse.json({
      isRunning: false,
      current: jobState.current,
      total: jobState.total,
      error: jobState.error,
      result: {
        groups: [],
        totalFiles: totalIndexed,
        totalGroups: 0,
        errors: [],
        method: 'nodejs',
      },
    });
  }

  const hashes = dupHashes.map((r) => r.photoHashSha);

  const records = await prisma.apenado.findMany({
    where: { photoHashSha: { in: hashes } },
    select: { id: true, name: true, matricula: true, unidade: true, faccao: true, photoPath: true, photoHashSha: true, photoQuality: true },
    orderBy: { name: 'asc' },
  });

  // Agrupa por hash
  const byHash = new Map<string, typeof records>();
  for (const r of records) {
    if (!r.photoHashSha) continue;
    const arr = byHash.get(r.photoHashSha) ?? [];
    arr.push(r);
    byHash.set(r.photoHashSha, arr);
  }

  const groups = Array.from(byHash.values())
    .filter((g) => g.length >= 2)
    // Remove photoHashSha do output (frontend não precisa)
    .map((g) => g.map(({ photoHashSha: _h, ...rest }) => rest));

  return NextResponse.json({
    isRunning: false,
    current: jobState.current,
    total: jobState.total,
    error: jobState.error,
    result: {
      groups,
      totalFiles: totalIndexed,
      totalGroups: groups.length,
      errors: [],
      method: 'nodejs',
    },
  });
}

// POST — inicia indexação SHA-256 em background (retorna imediatamente)
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

  startExactDupJob();
  return NextResponse.json({ started: true });
}

// DELETE — exclui registros duplicados mantendo o primeiro de cada grupo
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
