import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs';
import { getApenadoPhotoPath } from '@/lib/storage';
import { getUnifiedDupState, startUnifiedDupJob } from '@/lib/unified-duplicate-job';
import { isPhotoReferenced } from '@/lib/photo-helpers';

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
    const merges: Array<{ idToDelete: string; keepId: string }> = Array.isArray(body.merges) ? body.merges : [];

    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: 'Nenhum ID informado' }, { status: 400 });
    }

    // 1. Buscar dados dos apenados deletados e mantidos
    const allIds = Array.from(new Set([...idsToDelete, ...merges.map((m) => m.keepId)]));
    const apenados = await prisma.apenado.findMany({
      where: { id: { in: allIds } },
      select: { id: true, photoPath: true },
    });

    const apenadosMap = new Map(apenados.map((a) => [a.id, a]));

    // 2. Processar cada par de mesclagem para atualizar as referências do SIAIP e inteligência
    for (const merge of merges) {
      const apenadoToDelete = apenadosMap.get(merge.idToDelete);
      const apenadoToKeep = apenadosMap.get(merge.keepId);

      if (!apenadoToDelete || !apenadoToKeep) continue;

      // Re-vincular os apenados importados do SIPE/SIAIP para o apenado mantido
      await prisma.sipeApenadoImportado.updateMany({
        where: { apenadoLocalId: merge.idToDelete },
        data: { apenadoLocalId: merge.keepId },
      });

      // Re-vincular as fotos complementares para o apenado mantido
      await prisma.sipeFotoComplementar.updateMany({
        where: { apenadoLocalId: merge.idToDelete },
        data: { apenadoLocalId: merge.keepId },
      });

      // Se o apenado deletado tinha foto e o mantido também tem, atualiza as tabelas que usavam a foto antiga
      if (apenadoToDelete.photoPath && apenadoToKeep.photoPath) {
        const deletePhotoPath = apenadoToDelete.photoPath;
        const keepPhotoPath = apenadoToKeep.photoPath;

        // Atualizar foto principal em SipeApenadoImportado
        await prisma.sipeApenadoImportado.updateMany({
          where: { photoPath: deletePhotoPath },
          data: { photoPath: keepPhotoPath },
        });

        // Atualizar foto em SipeFotoComplementar
        await prisma.sipeFotoComplementar.updateMany({
          where: { photoPath: deletePhotoPath },
          data: { photoPath: keepPhotoPath },
        });

        // Atualizar foto em AIPApenado
        await prisma.aIPApenado.updateMany({
          where: { photoPath: deletePhotoPath },
          data: { photoPath: keepPhotoPath },
        });
      }
    }

    // 3. Deletar arquivos físicos de fotos, mas APENAS se não houver referências a eles no banco
    const apenadosToDelete = apenados.filter((a) => idsToDelete.includes(a.id));
    
    await Promise.allSettled(
      apenadosToDelete
        .filter((a) => a.photoPath)
        .map(
          (a) =>
            new Promise<void>(async (res) => {
              try {
                const referenced = await isPhotoReferenced(a.photoPath!, a.id);
                if (!referenced) {
                  unlink(getApenadoPhotoPath(a.photoPath!), () => res());
                } else {
                  res();
                }
              } catch {
                res();
              }
            }),
        ),
    );

    // 4. Deletar registros locais do banco
    const result = await prisma.apenado.deleteMany({ where: { id: { in: idsToDelete } } });

    return NextResponse.json({ deleted: result.count });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
