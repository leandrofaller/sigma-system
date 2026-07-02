import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

function uploadsBase() {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
}

// Obter detalhe de uma pichação
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const pichacao = await prisma.pichacaoFacciosa.findUnique({
      where: { id },
      include: {
        faccao: { select: { id: true, nome: true, sigla: true, cor: true } },
        cadastradoPor: { select: { id: true, name: true, role: true } },
      },
    });

    if (!pichacao) {
      return NextResponse.json({ error: 'Registro de pichação não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ pichacao });
  } catch (error: any) {
    console.error('[PICHACOES GET BY ID] Erro:', error);
    return NextResponse.json({ error: 'Erro interno ao buscar pichação' }, { status: 500 });
  }
}

// Atualizar pichação
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const { id } = await params;

  try {
    const pichacao = await prisma.pichacaoFacciosa.findUnique({
      where: { id },
      select: { cadastradoPorId: true, fotos: true },
    });

    if (!pichacao) {
      return NextResponse.json({ error: 'Registro de pichação não encontrado' }, { status: 404 });
    }

    // Permissão: Apenas quem cadastrou ou Administradores
    const canEdit = ['SUPER_ADMIN', 'ADMIN'].includes(role) || pichacao.cadastradoPorId === userId;
    if (!canEdit) {
      return NextResponse.json({ error: 'Sem permissão para editar este registro' }, { status: 403 });
    }

    const body = await req.json();
    const {
      municipio,
      endereco,
      latitude,
      longitude,
      faccaoId,
      descricao,
      fotos
    } = body;

    // Se novas fotos foram fornecidas, apaga as fotos antigas que não estão na nova lista
    if (Array.isArray(fotos)) {
      const fotosParaRemover = pichacao.fotos.filter(f => !fotos.includes(f));
      for (const url of fotosParaRemover) {
        try {
          const filename = url.split('/').pop();
          if (filename) {
            const filePath = join(uploadsBase(), 'pichacoes', filename);
            if (existsSync(filePath)) {
              await unlink(filePath);
            }
          }
        } catch (err) {
          console.error(`Erro ao apagar arquivo de foto órfão: ${url}`, err);
        }
      }
    }

    const updated = await prisma.pichacaoFacciosa.update({
      where: { id },
      data: {
        ...(municipio !== undefined && { municipio }),
        ...(endereco !== undefined && { endereco }),
        ...(latitude !== undefined && { latitude: latitude ? parseFloat(latitude) : null }),
        ...(longitude !== undefined && { longitude: longitude ? parseFloat(longitude) : null }),
        ...(faccaoId !== undefined && { faccaoId: faccaoId || null }),
        ...(descricao !== undefined && { descricao: descricao || null }),
        ...(fotos !== undefined && { fotos: Array.isArray(fotos) ? fotos : [] }),
      },
      include: {
        faccao: { select: { id: true, nome: true, sigla: true, cor: true } },
        cadastradoPor: { select: { id: true, name: true, role: true } },
      }
    });

    return NextResponse.json({ pichacao: updated });
  } catch (error: any) {
    console.error('[PICHACOES PATCH] Erro:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar pichação' }, { status: 500 });
  }
}

// Excluir pichação
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const { id } = await params;

  try {
    const pichacao = await prisma.pichacaoFacciosa.findUnique({
      where: { id },
      select: { cadastradoPorId: true, fotos: true },
    });

    if (!pichacao) {
      return NextResponse.json({ error: 'Registro de pichação não encontrado' }, { status: 404 });
    }

    // Permissão: Apenas quem cadastrou ou Administradores
    const canDelete = ['SUPER_ADMIN', 'ADMIN'].includes(role) || pichacao.cadastradoPorId === userId;
    if (!canDelete) {
      return NextResponse.json({ error: 'Sem permissão para excluir este registro' }, { status: 403 });
    }

    // Apaga as fotos físicas do disco em /uploads/pichacoes/
    for (const url of pichacao.fotos) {
      try {
        const filename = url.split('/').pop();
        if (filename) {
          const filePath = join(uploadsBase(), 'pichacoes', filename);
          if (existsSync(filePath)) {
            await unlink(filePath);
          }
        }
      } catch (err) {
        console.error(`Erro ao apagar arquivo físico de foto durante exclusão: ${url}`, err);
      }
    }

    await prisma.pichacaoFacciosa.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[PICHACOES DELETE] Erro:', error);
    return NextResponse.json({ error: 'Erro interno ao excluir pichação' }, { status: 500 });
  }
}
