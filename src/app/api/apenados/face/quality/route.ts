import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  docFilterSql,
  tattooFilterSql,
  otherNoFaceFilterSql,
  faceMissedFilterSql,
  type QualityTab,
} from '@/lib/face-quality-filters';
import { getClassificationState } from '@/lib/photo-classification-job';

const TAKE_MAX = 100;

const RAW_SELECT = `id, name, matricula, unidade, "photoPath", "photoQuality", "detScore",
  "photoCategory", "photoCategoryConf", "photoCategoryReason"`;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as { role?: string };
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const tab = (sp.get('tab') || 'lowscore') as QualityTab;
  const skip = Math.max(0, parseInt(sp.get('skip') || '0', 10));
  const take = Math.min(TAKE_MAX, Math.max(1, parseInt(sp.get('take') || '50', 10)));

  const [
    total,
    indexed,
    lowScore,
    blurry,
    pending,
    countDoc,
    countTattoo,
    countOther,
    countFaceMissed,
    countClassified,
  ] = await Promise.all([
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    prisma.apenado.count({ where: { faceDescriptor: { startsWith: '[' } } }),
    prisma.apenado.count({
      where: { faceDescriptor: { startsWith: '[' }, detScore: { lt: 0.5 } },
    }),
    prisma.apenado.count({
      where: {
        faceDescriptor: { startsWith: '[' },
        photoQuality: { lt: 50 },
      },
    }),
    prisma.apenado.count({
      where: { faceDescriptor: null, photoPath: { not: null } },
    }),
    prisma.$queryRawUnsafe<[{ count: bigint }]>(
      'SELECT COUNT(*)::bigint AS count FROM apenados WHERE ' + docFilterSql,
    ).then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRawUnsafe<[{ count: bigint }]>(
      'SELECT COUNT(*)::bigint AS count FROM apenados WHERE ' + tattooFilterSql,
    ).then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRawUnsafe<[{ count: bigint }]>(
      'SELECT COUNT(*)::bigint AS count FROM apenados WHERE ' + otherNoFaceFilterSql,
    ).then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRawUnsafe<[{ count: bigint }]>(
      'SELECT COUNT(*)::bigint AS count FROM apenados WHERE ' + faceMissedFilterSql,
    ).then((r) => Number(r[0]?.count ?? 0)),
    prisma.apenado.count({
      where: { photoClassifiedAt: { not: null }, photoPath: { not: null } },
    }),
  ]);

  const select = {
    id: true,
    name: true,
    matricula: true,
    unidade: true,
    photoPath: true,
    photoQuality: true,
    detScore: true,
    photoCategory: true,
    photoCategoryConf: true,
    photoCategoryReason: true,
  };

  let records: unknown[];
  let tabTotal: number;

  if (tab === 'lowscore') {
    const where = { faceDescriptor: { startsWith: '[' }, detScore: { lt: 0.5 } };
    [records, tabTotal] = await Promise.all([
      prisma.apenado.findMany({ where, select, skip, take, orderBy: { detScore: 'asc' } }),
      prisma.apenado.count({ where }),
    ]);
  } else if (tab === 'blurry') {
    const where = { faceDescriptor: { startsWith: '[' }, photoQuality: { lt: 50 } };
    [records, tabTotal] = await Promise.all([
      prisma.apenado.findMany({ where, select, skip, take, orderBy: { photoQuality: 'asc' } }),
      prisma.apenado.count({ where }),
    ]);
  } else if (tab === 'face_missed') {
    [records, tabTotal] = await Promise.all([
      prisma.$queryRawUnsafe<unknown[]>(
        `SELECT ${RAW_SELECT}
         FROM apenados
         WHERE ${faceMissedFilterSql}
         ORDER BY "photoCategoryConf" DESC NULLS LAST
         LIMIT ${take} OFFSET ${skip}`,
      ),
      Promise.resolve(countFaceMissed),
    ]);
  } else if (tab === 'noface_doc') {
    [records, tabTotal] = await Promise.all([
      prisma.$queryRawUnsafe<unknown[]>(
        `SELECT ${RAW_SELECT}
         FROM apenados
         WHERE ${docFilterSql}
         ORDER BY "photoCategoryConf" DESC NULLS LAST, "photoQuality" DESC
         LIMIT ${take} OFFSET ${skip}`,
      ),
      Promise.resolve(countDoc),
    ]);
  } else if (tab === 'noface_tattoo') {
    [records, tabTotal] = await Promise.all([
      prisma.$queryRawUnsafe<unknown[]>(
        `SELECT ${RAW_SELECT}
         FROM apenados
         WHERE ${tattooFilterSql}
         ORDER BY "photoCategoryConf" DESC NULLS LAST, "photoQuality" DESC
         LIMIT ${take} OFFSET ${skip}`,
      ),
      Promise.resolve(countTattoo),
    ]);
  } else if (tab === 'noface') {
    [records, tabTotal] = await Promise.all([
      prisma.$queryRawUnsafe<unknown[]>(
        `SELECT ${RAW_SELECT}
         FROM apenados
         WHERE ${otherNoFaceFilterSql}
         ORDER BY "photoQuality" DESC
         LIMIT ${take} OFFSET ${skip}`,
      ),
      Promise.resolve(countOther),
    ]);
  } else {
    const where = { faceDescriptor: null, photoPath: { not: null } };
    [records, tabTotal] = await Promise.all([
      prisma.apenado.findMany({ where, select, skip, take, orderBy: { createdAt: 'asc' } }),
      prisma.apenado.count({ where }),
    ]);
  }

  const classification = getClassificationState();

  return NextResponse.json({
    stats: {
      total,
      indexed,
      noFace: countDoc + countTattoo + countOther,
      noFaceDoc: countDoc,
      noFaceTattoo: countTattoo,
      noFaceOther: countOther,
      faceMissed: countFaceMissed,
      classified: countClassified,
      lowScore,
      blurry,
      pending,
    },
    classification: {
      isRunning: classification.isRunning,
      progress: classification.progress,
      error: classification.error,
      mode: classification.mode,
    },
    records,
    total: tabTotal,
    skip,
    take,
  });
}