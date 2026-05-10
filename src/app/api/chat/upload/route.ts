import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const groupId = formData.get('groupId') as string | null;
  const receiverId = formData.get('receiverId') as string | null;

  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.name.split('.').pop() || 'bin';
  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = join(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'), 'chat');

  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), buffer);

  const isImage = file.type.startsWith('image/');
  const fileUrl = `/api/uploads/chat/${filename}`;

  const message = await prisma.chatMessage.create({
    data: {
      content: file.name,
      type: isImage ? 'IMAGE' : 'FILE',
      fileUrl,
      fileName: file.name,
      fileSize: file.size,
      senderId: user.id,
      groupId: groupId || null,
      receiverId: receiverId || null,
    },
    include: { sender: true },
  });

  return NextResponse.json(message, { status: 201 });
}
