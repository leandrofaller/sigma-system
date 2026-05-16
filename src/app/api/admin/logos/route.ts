import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { assertUploadAllowed } from '@/lib/security';

const ALLOWED = ['badge-aip', 'badge-sejus', 'badge-policia-penal'];
const LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;
const MAX_BADGE_PX = 512;

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
  const pngBuffer = await sharp(Buffer.from(bytes))
    .resize(MAX_BADGE_PX, MAX_BADGE_PX, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 8 })
    .toBuffer();

  const logosDir = join(process.cwd(), 'public', 'logos');
  await mkdir(logosDir, { recursive: true });

  const filename = `${slot}.png`;
  const { writeFile } = await import('fs/promises');
  await writeFile(join(logosDir, filename), pngBuffer);

  return NextResponse.json({ url: `/logos/${filename}?t=${Date.now()}` });
}
