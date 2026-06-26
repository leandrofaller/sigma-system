import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getApenadoPhotoPath } from '@/lib/storage';
import { existsSync } from 'fs';
import { rename, mkdir, unlink, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { invalidateFaceCache } from '@/lib/face-cache';
import { pgvectorAvailable, clearVector } from '@/lib/pgvector';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body.action; // 'approve' | 'reject'

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Ação inválida. Use "approve" ou "reject".' }, { status: 400 });
    }

    // Busca o log de sanitização
    const log = await prisma.imageSanitization.findUnique({
      where: { id },
    });

    if (!log) {
      return NextResponse.json({ error: 'Registro de sanitização não encontrado' }, { status: 404 });
    }

    if (log.status === 'APPROVED' || log.status === 'REJECTED') {
      return NextResponse.json({ error: `Este registro já foi processado e está marcado como ${log.status}.` }, { status: 400 });
    }

    if (action === 'approve') {
      // 1. Rollback da imagem: mover da quarentena para o diretório de apenados (apenas se for diferente)
      const srcPath = getApenadoPhotoPath(log.photoPath);
      const destPath = getApenadoPhotoPath(log.originalPath);
 
      if (srcPath !== destPath && existsSync(srcPath)) {
        await mkdir(dirname(destPath), { recursive: true });
        await rename(srcPath, destPath);
      }
 
      // 2. Restaurar photoPath no Apenado correspondente para re-indexação facial
      if (log.apenadoId) {
        await prisma.apenado.update({
          where: { id: log.apenadoId },
          data: {
            photoPath: log.originalPath,
            // Reseta metadados faciais para forçar o indexing-job a re-analisar e re-inserir no ArcFace
            faceDescriptor: null,
            detScore: null,
            photoHash: null,
            photoHashSha: null,
            photoQuality: null,
          },
        });
      }
 
      // 3. Atualizar status da sanitização
      await prisma.imageSanitization.update({
        where: { id },
        data: { status: 'APPROVED' },
      });
 
      invalidateFaceCache();
      return NextResponse.json({ ok: true, message: 'Imagem aprovada e restaurada para a fila de indexação.' });
    }
 
    if (action === 'reject') {
      // 1. Deletar arquivo físico
      const srcPath = getApenadoPhotoPath(log.photoPath);
      if (existsSync(srcPath)) {
        await unlink(srcPath);
      }
 
      // 2. Desvincular foto e embedding do apenado local para retirar do ArcFace (já que não foi limpo antes)
      if (log.apenadoId) {
        await prisma.apenado.update({
          where: { id: log.apenadoId },
          data: {
            photoPath: null,
            faceDescriptor: null,
            detScore: null,
            photoHash: null,
            photoHashSha: null,
            photoQuality: null,
          },
        });
 
        // Se pgvector estiver disponível, remove o vetor do índice
        if (await pgvectorAvailable()) {
          await clearVector(log.apenadoId);
        }
      }
 
      // 3. Atualizar status para REJECTED
      await prisma.imageSanitization.update({
        where: { id },
        data: { status: 'REJECTED' },
      });
 
      invalidateFaceCache();
      return NextResponse.json({ ok: true, message: 'Imagem rejeitada e removida permanentemente do disco.' });
    }

    return NextResponse.json({ error: 'Ação não suportada' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { id } = await params;
    const log = await prisma.imageSanitization.findUnique({
      where: { id },
      select: { photoPath: true },
    });

    if (!log?.photoPath) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    const filePath = getApenadoPhotoPath(log.photoPath);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    const buffer = await readFile(filePath);
    const contentType = filePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
