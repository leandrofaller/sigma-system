import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs';
import { getApenadoPhotoPath } from '@/lib/storage';
import { getUnifiedDupState, startUnifiedDupJob } from '@/lib/unified-duplicate-job';

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    return NextResponse.json(getUnifiedDupState());
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const started = startUnifiedDupJob();
    if (!started) {
      return NextResponse.json({ error: 'Verificação já em andamento.' }, { status: 409 });
    }

    return NextResponse.json({ started: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const idsToDelete: string[] = Array.isArray(body.idsToDelete) ? body.idsToDelete : [];
    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: 'Nenhum ID informado' }, { status: 400 });
    }

    const apenados = await prisma.apenado.findMany({
      where: { id: { in: idsToDelete } },
      select: { id: true, photoPath: true },
    });

    await Promise.allSettled(
      apenados
        .filter((a) => a.photoPath)
        .map(
          (a) =>
            new Promise<void>((res) => {
              unlink(getApenadoPhotoPath(a.photoPath!), () => res());
            }),
        ),
    );

    const result = await prisma.apenado.deleteMany({ where: { id: { in: idsToDelete } } });

    return NextResponse.json({ deleted: result.count });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
