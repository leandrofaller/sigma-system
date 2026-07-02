import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { assertUploadAllowed } from '@/lib/security';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

const ARQUIVO_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'webp',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip',
] as const;

function uploadsBase() {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const { searchParams } = new URL(req.url);
  const groupFilter = searchParams.get('groupId');

  try {
    const where = isAdmin
      ? groupFilter ? { groupId: groupFilter } : {}
      : { groupId: user.groupId ?? null };

    const files = await prisma.arquivoFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { name: true } },
        group: { select: { name: true } },
        folder: true,
      },
    });
    return NextResponse.json(files);
  } catch (err: any) {
    console.error('[arquivo GET]', err);
    return NextResponse.json({ error: 'Erro ao buscar arquivos.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const source = (formData.get('source') as string) || '';
    const notes = (formData.get('notes') as string) || '';
    const classification = (formData.get('classification') as string) || 'RESERVADO';
    const folderId = (formData.get('folderId') as string) || null;

    // Admins podem escolher o grupo; OPERATORs ficam no próprio grupo
    const groupId = isAdmin
      ? (formData.get('groupId') as string) || null
      : user.groupId || null;

    if (!file || !title?.trim()) {
      return NextResponse.json({ error: 'Título e arquivo são obrigatórios' }, { status: 400 });
    }

    const uploadError = assertUploadAllowed(file, { allowedExtensions: ARQUIVO_EXTENSIONS });
    if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const isImage = file.type.startsWith('image/');

    let saveBuffer: Buffer;
    let uniqueName: string;
    let savedType: string;
    let savedSize: number;

    if (isImage) {
      saveBuffer = await sharp(rawBuffer)
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer();
      uniqueName = `${uuidv4()}.webp`;
      savedType = 'image/webp';
      savedSize = saveBuffer.length;
    } else {
      saveBuffer = rawBuffer;
      uniqueName = `${uuidv4()}${path.extname(file.name) || '.bin'}`;
      savedType = file.type;
      savedSize = file.size;
    }

    const dir = join(uploadsBase(), 'arquivo');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, uniqueName), saveBuffer);

    const localPath = `/api/uploads/arquivo/${uniqueName}`;

    const record = await prisma.arquivoFile.create({
      data: {
        title: title.trim(),
        source,
        filename: uniqueName,
        originalName: file.name,
        fileType: savedType,
        fileSize: savedSize,
        localPath,
        classification: classification as any,
        uploadedById: user.id,
        groupId,
        folderId,
        notes,
      },
      include: {
        uploadedBy: { select: { name: true } },
        group: { select: { name: true } },
        folder: true,
      },
    });

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.UPLOAD_FILE,
      entity: 'ArquivoFile',
      entityId: record.id,
      details: { title, source, fileName: file.name, groupId },
      request: req,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    console.error('[arquivo POST]', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao importar arquivo.' }, { status: 500 });
  }
}
