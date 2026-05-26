import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink, readdir } from 'fs/promises';
import { join } from 'path';
import { getApenadosDir } from '@/lib/storage';

// GET: return counts for confirmation dialogs
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const [semFoto, comFoto] = await Promise.all([
    prisma.apenado.count({ where: { photoPath: null } }),
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
  ]);

  return NextResponse.json({ semFoto, comFoto });
}

// DELETE: bulk destructive actions
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const action = req.nextUrl.searchParams.get('action');

  // ── Limpar registros sem foto (ADMIN+) ──────────────────────────
  if (action === 'sem-foto') {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    try {
      const result = await prisma.apenado.deleteMany({
        where: { photoPath: null },
      });
      return NextResponse.json({ deleted: result.count });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // ── Deletar todas as fotos (SUPER_ADMIN only) ───────────────────
  if (action === 'clear-fotos') {
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Apenas Super Administrador pode executar esta ação' }, { status: 403 });
    }

    try {
      // 1. Clear DB first
      const result = await prisma.apenado.updateMany({
        where: { photoPath: { not: null } },
        data: { photoPath: null, photoHash: null, photoQuality: null },
      });

      // 2. Delete files from disk (best-effort)
      const dir = getApenadosDir();
      try {
        const files = await readdir(dir);
        await Promise.allSettled(
          files.map((f) => unlink(join(dir, f)))
        );
      } catch {}

      return NextResponse.json({ cleared: result.count });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
