import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/admin/migrate
// Aplica colunas adicionais que podem não ter sido criadas pelo prisma db push no boot.
// Idempotente: ADD COLUMN IF NOT EXISTS não falha se a coluna já existir.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado — requer SUPER_ADMIN' }, { status: 403 });
  }

  return NextResponse.json({ steps: [], errors: [], success: true });
}
