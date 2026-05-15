import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { assertUploadAllowed, getExtension } from '@/lib/security';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const;

function uploadsBase() {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 });
  const uploadError = assertUploadAllowed(file, {
    allowedExtensions: IMAGE_EXTENSIONS,
    allowedMimePrefixes: ['image/'],
  });
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

  const ext = getExtension(file.name);
  const filename = `${randomUUID()}.${ext}`;
  const dir = join(uploadsBase(), 'relints');

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ url: `/api/uploads/relints/${filename}` }, { status: 201 });
}
