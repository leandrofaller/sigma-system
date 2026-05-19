import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { join } from 'path';
import { runIndexBatch, type IndexResult } from '@/lib/arcface-batch';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { ids } = (await req.json()) as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids inválidos' }, { status: 400 });
  }

  const uploadsDir = join(process.cwd(), 'uploads', 'apenados');

  let results: IndexResult[];
  try {
    results = await runIndexBatch(ids, uploadsDir);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  let faces = 0;
  let skipped = 0;
  let errors = 0;

  const updates: Promise<any>[] = [];

  for (const r of results) {
    if (r.done) continue;
    if (!r.id) continue;
    if (r.embedding && Array.isArray(r.embedding) && r.embedding.length === 512) {
      updates.push(
        prisma.apenado.update({
          where: { id: r.id },
          data: { faceDescriptor: JSON.stringify(r.embedding) },
        }),
      );
      faces++;
    } else if (r.no_face || r.no_photo) {
      skipped++;
    } else {
      errors++;
    }
  }

  await Promise.all(updates);

  return NextResponse.json({ processed: ids.length, faces, skipped, errors });
}
