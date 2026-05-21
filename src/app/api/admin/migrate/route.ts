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

  const steps: string[] = [];
  const errors: string[] = [];

  const migrations = [
    { col: 'ocrText',  sql: `ALTER TABLE apenados ADD COLUMN IF NOT EXISTS "ocrText" TEXT` },
    { col: 'ocrName',  sql: `ALTER TABLE apenados ADD COLUMN IF NOT EXISTS "ocrName" TEXT` },
  ];

  for (const m of migrations) {
    try {
      await prisma.$executeRawUnsafe(m.sql);
      steps.push(`${m.col}: OK`);
    } catch (e: any) {
      errors.push(`${m.col}: ${e.message}`);
    }
  }

  return NextResponse.json({ steps, errors, success: errors.length === 0 });
}
