import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import { getApenadoPhotoPath } from '@/lib/storage';

// GET /api/apenados/no-face?skip=0&take=50&minQuality=0
// Returns records where faceDescriptor = 'NONE' (photo exists but no face detected),
// ordered by photoQuality DESC so high-quality document scans appear first.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const skip = Math.max(0, parseInt(params.get('skip') || '0', 10));
  const take = Math.min(Math.max(1, parseInt(params.get('take') || '50', 10)), 200);
  const minQuality = parseFloat(params.get('minQuality') || '0');

  const where = {
    faceDescriptor: 'NONE',
    photoPath: { not: null },
    ...(minQuality > 0 ? { photoQuality: { gte: minQuality } } : {}),
  };

  const [records, total] = await Promise.all([
    prisma.apenado.findMany({
      where,
      orderBy: [{ photoQuality: 'desc' }, { id: 'asc' }],
      skip,
      take,
      select: {
        id: true,
        name: true,
        matricula: true,
        unidade: true,
        photoPath: true,
        photoQuality: true,
      },
    }),
    prisma.apenado.count({ where }),
  ]);

  return NextResponse.json({ records, total, skip, take });
}

// DELETE /api/apenados/no-face — removes photos only (keeps inmate records)
// Body: { ids: string[] }
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Nenhum ID informado' }, { status: 400 });

  const records = await prisma.apenado.findMany({
    where: { id: { in: ids } },
    select: { id: true, photoPath: true },
  });

  // Remove photo files from disk (best-effort)
  await Promise.allSettled(
    records.filter((r) => r.photoPath).map((r) =>
      unlink(getApenadoPhotoPath(r.photoPath!)).catch(() => {}),
    ),
  );

  // Clear photoPath + faceDescriptor + photoQuality in DB
  const result = await prisma.apenado.updateMany({
    where: { id: { in: ids } },
    data: { photoPath: null, faceDescriptor: null, photoQuality: null },
  });

  return NextResponse.json({ updated: result.count });
}
