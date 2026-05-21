import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAuditState, startAudit, stopAudit } from '@/lib/audit-job';
import { getJobState as getIndexingState } from '@/lib/indexing-job';

// Camera-style filename pattern
const CAMERA_RE =
  /^(DSC[FN_]?\d+|IMG[-_]\d+|DSCN?\d+|P\d{6,}|MVI_\d+|IMG-WA\d+|PICT\d+|PHOTO_?\d+|\d{8,}.*)$/i;

function isCameraName(name: string) {
  const words = name.match(/[A-Za-zÀ-ú]{3,}/g) ?? [];
  return words.length < 2 || CAMERA_RE.test(name.trim());
}

// GET — state or list
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter');

  // When filter is requested, return apenados list
  if (filter) {
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = 50;
    const offset = (page - 1) * limit;

    let where: any = {};
    if (filter === 'has_suggestion') {
      where = { ocrName: { not: null }, photoPath: { not: null } };
    } else if (filter === 'camera') {
      // Return all with photos; client-side camera filter
      where = { photoPath: { not: null } };
    } else if (filter === 'pending') {
      where = { photoPath: { not: null }, ocrText: null };
    }

    const [rows, total] = await Promise.all([
      prisma.apenado.findMany({
        where,
        select: { id: true, name: true, ocrName: true, ocrText: true, photoPath: true, matricula: true, unidade: true },
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.apenado.count({ where }),
    ]);

    const filtered =
      filter === 'camera'
        ? rows.filter((r) => isCameraName(r.name))
        : rows;

    return NextResponse.json({ rows: filtered, total: filter === 'camera' ? filtered.length : total, page, limit });
  }

  // Default: return audit job state + summary counts
  const auditState = getAuditState();

  const [totalWithPhoto, processedCount, withSuggestion, pendingCount] = await Promise.all([
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    prisma.apenado.count({ where: { photoPath: { not: null }, ocrText: { not: null } } }),
    prisma.apenado.count({ where: { ocrName: { not: null } } }),
    prisma.apenado.count({ where: { photoPath: { not: null }, ocrText: null } }),
  ]);

  return NextResponse.json({
    ...auditState,
    summary: { totalWithPhoto, processedCount, withSuggestion, pendingCount },
  });
}

// POST — start audit
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const indexState = getIndexingState();
  if (indexState.isRunning) {
    return NextResponse.json(
      { error: 'Indexação de rostos em andamento. Aguarde terminar antes de iniciar a auditoria.' },
      { status: 409 },
    );
  }

  const auditState = getAuditState();
  if (auditState.isRunning) {
    return NextResponse.json({ error: 'Auditoria já em andamento.' }, { status: 409 });
  }

  startAudit();
  return NextResponse.json({ started: true });
}

// DELETE — stop audit
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  stopAudit();
  return NextResponse.json({ stopped: true });
}

// PATCH — apply OCR suggestion (rename single apenado)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  // Bulk rename: { ids: string[] } — apply ocrName to each
  if (body?.ids) {
    const ids: string[] = body.ids;
    const records = await prisma.apenado.findMany({
      where: { id: { in: ids }, ocrName: { not: null } },
      select: { id: true, ocrName: true },
    });
    await Promise.all(
      records
        .filter((r) => r.ocrName)
        .map((r) => prisma.apenado.update({ where: { id: r.id }, data: { name: r.ocrName! } })),
    );
    return NextResponse.json({ updated: records.length });
  }

  // Single rename: { id: string, name: string }
  if (body?.id && body?.name) {
    await prisma.apenado.update({ where: { id: body.id }, data: { name: body.name } });
    return NextResponse.json({ updated: 1 });
  }

  return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
}
