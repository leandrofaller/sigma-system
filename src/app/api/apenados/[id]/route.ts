import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import { getApenadoPhotoPath } from '@/lib/storage';
import { z } from 'zod';
import { isPhotoReferenced } from '@/lib/photo-helpers';

const apenadoSchema = z.object({
  name: z.string().min(1).max(200),
  matricula: z.string().max(50).optional().nullable(),
  unidade: z.string().max(100).optional().nullable(),
  faccao: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const apenado = await prisma.apenado.findUnique({
    where: { id },
    select: {
      id: true, name: true, matricula: true, unidade: true,
      faccao: true, notes: true, photoPath: true, photoQuality: true, createdAt: true,
    },
  });

  if (!apenado) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  return NextResponse.json(apenado);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = apenadoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, matricula, unidade, faccao, notes } = parsed.data;

  const apenado = await prisma.apenado.update({
    where: { id },
    data: {
      name: name.trim().toUpperCase(),
      matricula: matricula?.trim() || null,
      unidade: unidade?.trim() || null,
      faccao: faccao?.trim() || null,
      notes: notes?.trim() || null,
    },
  });

  return NextResponse.json(apenado);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { id } = await params;
  const apenado = await prisma.apenado.findUnique({ where: { id } });
  if (!apenado) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  if (apenado.photoPath) {
    try {
      const referenced = await isPhotoReferenced(apenado.photoPath, id);
      if (!referenced) {
        await unlink(getApenadoPhotoPath(apenado.photoPath));
      }
    } catch {}
  }

  await prisma.apenado.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
