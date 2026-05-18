import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readFile } from 'fs/promises';
import { join } from 'path';
import JSZip from 'jszip';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const apenados = await prisma.apenado.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      matricula: true,
      unidade: true,
      photoPath: true,
      notes: true,
      createdAt: true,
    },
  });

  const zip = new JSZip();

  // CSV index
  const csvRows = [
    'ID,NOME,MATRÍCULA,UNIDADE,OBSERVAÇÕES,CADASTRO',
    ...apenados.map((a: { id: string; name: string; matricula: string | null; unidade: string | null; notes: string | null; createdAt: Date }) =>
      [
        a.id,
        `"${a.name}"`,
        a.matricula || '',
        `"${a.unidade || ''}"`,
        `"${(a.notes || '').replace(/"/g, '""')}"`,
        a.createdAt.toISOString().split('T')[0],
      ].join(',')
    ),
  ].join('\n');
  zip.file('INDICE.csv', '﻿' + csvRows); // BOM for Excel

  // Photos organized by first letter
  const fotosFolder = zip.folder('fotos')!;
  for (const a of apenados) {
    if (!a.photoPath) continue;
    try {
      const buffer = await readFile(join(process.cwd(), a.photoPath));
      const letter = a.name.charAt(0).toUpperCase();
      const letterFolder = fotosFolder.folder(letter)!;
      const safeName = `${a.name}${a.matricula ? '_' + a.matricula : ''}`.replace(/[^a-zA-Z0-9\-_]/g, '_');
      letterFolder.file(`${safeName}.jpg`, buffer);
    } catch {}
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const date = new Date().toISOString().split('T')[0];

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="apenados_${date}.zip"`,
    },
  });
}
