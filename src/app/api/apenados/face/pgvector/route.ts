import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  pgvectorAvailable,
  getPgVectorStats,
  initPgVector,
  populateVectorsFromDescriptors,
  resetPgVectorStatus,
} from '@/lib/pgvector';

/** GET — status do pgvector (disponibilidade, contagem, índice) */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const stats = await getPgVectorStats();
  return NextResponse.json(stats);
}

/** POST — inicializa pgvector e opcionalmente migra embeddings existentes */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const migrate = body?.migrate === true;

  const initResult = await initPgVector();
  if (!initResult.ok) {
    return NextResponse.json(
      { error: `Falha ao inicializar pgvector: ${initResult.error}` },
      { status: 500 },
    );
  }

  resetPgVectorStatus();

  let migrated = 0;
  if (migrate) {
    migrated = await populateVectorsFromDescriptors(500);
  }

  const stats = await getPgVectorStats();
  return NextResponse.json({ ok: true, migrated, stats });
}
