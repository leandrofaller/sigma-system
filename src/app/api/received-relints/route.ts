import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { uploadToDrive, isDriveEnabled } from '@/lib/storage';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

function uploadsBase() {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  try {
    const files = await prisma.receivedRelint.findMany({
      where: isAdmin ? {} : { groupId: user.groupId ?? 'none' },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { name: true } }, group: { select: { name: true } }, folder: true },
    });
    return NextResponse.json(files);
  } catch (err: any) {
    console.error('[received-relints GET]', err);
    return NextResponse.json({ error: 'Erro ao buscar arquivos.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const source = formData.get('source') as string;
    const groupId = formData.get('groupId') as string;
    const notes = formData.get('notes') as string;
    const classification = (formData.get('classification') as string) || 'RESERVADO';

    if (!file || !title || !source) {
      return NextResponse.json({ error: 'Dados obrigatórios faltando' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name) || '.bin';
    const uniqueName = `${uuidv4()}${ext}`;
    const dir = join(uploadsBase(), 'received');

    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, uniqueName), buffer);

    const fileUrl = `/api/uploads/received/${uniqueName}`;

    let driveFileId: string | undefined;
    const backupConfig = await prisma.systemConfig.findUnique({ where: { key: 'backup_enabled' } });
    if ((backupConfig?.value as any)?.enabled && isDriveEnabled()) {
      try {
        driveFileId = await uploadToDrive(buffer, file.name, file.type);
      } catch (err) {
        console.error('Drive upload failed:', err);
      }
    }

    const folderId = (formData.get('folderId') as string) || null;

    const record = await prisma.receivedRelint.create({
      data: {
        title,
        source,
        filename: uniqueName,
        originalName: file.name,
        fileType: file.type,
        fileSize: file.size,
        localPath: fileUrl,
        driveFileId,
        classification: classification as any,
        uploadedById: user.id,
        groupId: groupId || null,
        folderId: folderId || null,
        notes,
      },
      include: { uploadedBy: { select: { name: true } }, group: { select: { name: true } }, folder: true },
    });

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.UPLOAD_FILE,
      entity: 'ReceivedRelint',
      entityId: record.id,
      details: { title, source, fileName: file.name },
      request: req,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    console.error('[received-relints POST]', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao importar arquivo.' }, { status: 500 });
  }
}
