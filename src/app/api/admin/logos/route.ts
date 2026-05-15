import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { assertUploadAllowed } from '@/lib/security';

const ALLOWED = ['badge-aip', 'badge-sejus', 'badge-policia-penal'];
const LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const slot = formData.get('slot') as string;

  if (!file || !slot) return NextResponse.json({ error: 'Dados obrigatórios ausentes' }, { status: 400 });
  if (!ALLOWED.includes(slot)) return NextResponse.json({ error: 'Slot inválido' }, { status: 400 });

  const uploadError = assertUploadAllowed(file, {
    allowedExtensions: LOGO_EXTENSIONS,
    allowedMimePrefixes: ['image/'],
  });
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const logosDir = join(process.cwd(), 'public', 'logos');
  await mkdir(logosDir, { recursive: true });

  // Always save as .png for consistent referencing
  const filename = `${slot}.png`;
  await writeFile(join(logosDir, filename), buffer);

  return NextResponse.json({ url: `/logos/${filename}?t=${Date.now()}` });
}
