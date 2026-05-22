import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const { descriptor } = await req.json();

  if (!Array.isArray(descriptor) || descriptor.length !== 512) {
    return NextResponse.json({ error: 'Descriptor inválido (esperado: array[512])' }, { status: 400 });
  }

  await prisma.apenado.update({
    where: { id },
    data: { faceDescriptor: JSON.stringify(descriptor) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  await prisma.apenado.update({ where: { id }, data: { faceDescriptor: null } });
  return NextResponse.json({ ok: true });
}
