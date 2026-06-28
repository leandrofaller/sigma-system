import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import { getApenadoPhotoPath } from '@/lib/storage';

import {
  getPrismaWhereForTab,
  getSqlFilterForTab,
  isNoFaceDeletionTab,
} from '@/lib/face-quality-filters';

const CLEAR_PHOTO_DATA = {
  photoPath: null,
  faceDescriptor: null,
  photoQuality: null,
  detScore: null,
  photoCategory: null,
  photoCategoryConf: null,
  photoCategoryReason: null,
  photoClassifiedAt: null,
  ocrText: null,
} as const;

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
// Body: { ids?: string[], all?: boolean, tab?: string }
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const isAll = !!body.all;
  const tab = body.tab || '';

  let photoPathsToUnlink: string[] = [];
  let updatedCount = 0;

  if (isAll) {
    if (!tab) {
      return NextResponse.json({ error: 'Aba não especificada para deleção global' }, { status: 400 });
    }

    if (!isNoFaceDeletionTab(tab)) {
      return NextResponse.json({
        error: 'Esta aba não permite remoção em massa. Use re-indexação para fotos com rosto detectado.',
      }, { status: 400 });
    }

    const prismaWhere = getPrismaWhereForTab(tab);
    const sqlFilter = getSqlFilterForTab(tab);

    if (sqlFilter) {
      // 1. Obter caminhos das fotos que serão limpas via SQL raw
      const rawRecords = await prisma.$queryRawUnsafe<{ photoPath: string | null }[]>(
        `SELECT "photoPath" FROM apenados WHERE ${sqlFilter}`
      );
      photoPathsToUnlink = rawRecords.map((r) => r.photoPath).filter((p): p is string => !!p);

      // 2. Executar update massivo no BD
      const result = await prisma.$executeRawUnsafe(
        `UPDATE apenados 
         SET "photoPath" = NULL, "faceDescriptor" = NULL, "photoQuality" = NULL,
             "detScore" = NULL, "photoCategory" = NULL, "photoCategoryConf" = NULL,
             "photoCategoryReason" = NULL, "photoClassifiedAt" = NULL, "ocrText" = NULL
         WHERE ${sqlFilter}`
      );
      updatedCount = result;
    } else if (Object.keys(prismaWhere).length > 0) {
      // 1. Obter caminhos das fotos via Prisma
      const records = await prisma.apenado.findMany({
        where: prismaWhere,
        select: { photoPath: true },
      });
      photoPathsToUnlink = records.map((r) => r.photoPath).filter((p): p is string => !!p);

      // 2. Executar update massivo via Prisma
      const result = await prisma.apenado.updateMany({
        where: prismaWhere,
        data: CLEAR_PHOTO_DATA,
      });
      updatedCount = result.count;
    } else {
      return NextResponse.json({ error: 'Aba inválida para deleção global' }, { status: 400 });
    }
  } else {
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) return NextResponse.json({ error: 'Nenhum ID informado' }, { status: 400 });

    if (tab === 'face_missed') {
      return NextResponse.json({
        error: 'Fotos com rosto detectado devem ser reindexadas, não removidas.',
      }, { status: 400 });
    }

    const records = await prisma.apenado.findMany({
      where: { id: { in: ids } },
      select: { id: true, photoPath: true, photoCategory: true },
    });

    const blocked = records.filter((r) =>
      r.photoCategory === 'FACE_OK' || r.photoCategory === 'FACE_MISSED',
    );
    if (blocked.length > 0) {
      return NextResponse.json({
        error: `${blocked.length} registro(s) têm rosto detectado na classificação. Use re-indexação.`,
      }, { status: 400 });
    }

    photoPathsToUnlink = records.map((r) => r.photoPath).filter((p): p is string => !!p);

    const result = await prisma.apenado.updateMany({
      where: { id: { in: ids } },
      data: CLEAR_PHOTO_DATA,
    });
    updatedCount = result.count;
  }

  // Remove photo files from disk in the background (prevent Gateway Timeout on high-volume deletes)
  if (photoPathsToUnlink.length > 0) {
    Promise.allSettled(
      photoPathsToUnlink.map((path) =>
        unlink(getApenadoPhotoPath(path)).catch(() => {}),
      ),
    ).catch(() => {});
  }

  return NextResponse.json({ updated: updatedCount });
}
