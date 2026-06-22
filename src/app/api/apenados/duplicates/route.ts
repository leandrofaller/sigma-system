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

    const state = getUnifiedDupState();
    if (state.phase === 'done' && state.groups.length > 0) {
      const ids = state.groups.flatMap(g => g.records.map(r => r.id));

      const apenados = await prisma.apenado.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          sipeImportacoes: {
            select: {
              sipeId: true,
              situacao: true,
              aipApenado: {
                select: {
                  id: true
                }
              }
            }
          }
        }
      });

      const infoMap = new Map();
      for (const a of apenados) {
        const primaryImport = a.sipeImportacoes[0];
        const hasSipe = a.sipeImportacoes.length > 0;
        const hasAip = a.sipeImportacoes.some(imp => imp.aipApenado !== null);
        const sipeId = primaryImport ? primaryImport.sipeId : null;
        const situacao = primaryImport ? primaryImport.situacao : null;

        infoMap.set(a.id, {
          hasAip,
          hasSipe,
          sipeId,
          situacao
        });
      }

      const enrichedGroups = state.groups.map(g => {
        const sortedRecords = g.records.map(r => {
          const info = infoMap.get(r.id);
          return {
            ...r,
            hasAip: info ? info.hasAip : r.hasAip,
            hasSipe: info ? info.hasSipe : false,
            sipeId: info ? info.sipeId : null,
            situacao: info ? info.situacao : null,
          };
        });

        const sorted = sortedRecords.sort((a, b) => {
          const hasAipA = a.hasAip ? 1 : 0;
          const hasAipB = b.hasAip ? 1 : 0;
          if (hasAipA !== hasAipB) return hasAipB - hasAipA;

          const hasSipeA = a.hasSipe ? 1 : 0;
          const hasSipeB = b.hasSipe ? 1 : 0;
          if (hasSipeA !== hasSipeB) return hasSipeB - hasSipeA;

          if (a.hasFace !== b.hasFace) return a.hasFace ? -1 : 1;
          return (b.photoQuality ?? 0) - (a.photoQuality ?? 0);
        });

        return {
          ...g,
          records: sorted
        };
      });

      return NextResponse.json({
        ...state,
        groups: enrichedGroups
      });
    }

    return NextResponse.json(state);
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

// Função auxiliar para processar um array em lotes com concorrência limitada
async function runInChunks<T>(items: T[], chunkSize: number, fn: (item: T) => Promise<any>) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.allSettled(chunk.map(fn));
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
    const validMerges = merges.filter(merge => {
      const apenadoToDelete = apenadosMap.get(merge.idToDelete);
      const apenadoToKeep = apenadosMap.get(merge.keepId);
      return apenadoToDelete && apenadoToKeep;
    });

    // Processar merges em lotes de 40 para evitar gargalos sequenciais ou saturação do pool
    await runInChunks(validMerges, 40, async (merge) => {
      const apenadoToDelete = apenadosMap.get(merge.idToDelete)!;
      const apenadoToKeep = apenadosMap.get(merge.keepId)!;

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
    });

    // 3. Deletar arquivos físicos de fotos, mas APENAS se não houver referências a eles no banco
    const apenadosToDelete = apenados.filter((a) => idsToDelete.includes(a.id) && a.photoPath);
    
    // Processar em blocos de 30 para evitar timeout de pool de conexões do Prisma
    await runInChunks(apenadosToDelete, 30, async (a) => {
      try {
        const referenced = await isPhotoReferenced(a.photoPath!, a.id);
        if (!referenced) {
          unlink(getApenadoPhotoPath(a.photoPath!), () => {});
        }
      } catch (err) {
        console.error(`Erro ao verificar/deletar foto física para apenado ${a.id}:`, err);
      }
    });

    // 4. Deletar registros locais do banco
    const result = await prisma.apenado.deleteMany({ where: { id: { in: idsToDelete } } });

    return NextResponse.json({ deleted: result.count });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
