import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { existsSync } from 'fs';
import { getApenadoPhotoPath } from '@/lib/storage';
import { startSipeSync, getSipeState } from '@/lib/sipe-scraper';

/**
 * GET /api/admin/apenados/verificar-fotos
 * Varre todos os registros de apenados locais que possuem photoPath configurado,
 * verifica se o arquivo correspondente existe fisicamente no disco do container de produção.
 * Se o parâmetro sync=true for fornecido, cria automaticamente um job no SIPE para baixar 
 * novamente as imagens ausentes.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado. Apenas administradores.' }, { status: 403 });
  }

  const sync = req.nextUrl.searchParams.get('sync') === 'true';

  try {
    console.log('[FOTOS-CHECK] Iniciando varredura física de caminhos de fotos...');

    // 1. Buscar apenados com photoPath preenchido (não nulo e não vazio)
    const apenados = await prisma.apenado.findMany({
      where: {
        AND: [
          { photoPath: { not: null } },
          { photoPath: { not: '' } }
        ]
      },
      select: {
        id: true,
        name: true,
        photoPath: true,
        sipeImportacoes: {
          select: {
            sipeId: true
          }
        }
      }
    });

    console.log(`[FOTOS-CHECK] Total de apenados com caminho de foto no banco: ${apenados.length}`);

    const missingPhotos: { id: string; name: string; photoPath: string; sipeId: number | null }[] = [];
    const sipeIdsToSync: number[] = [];

    // 2. Verificar existência de arquivos no disco
    for (const a of apenados) {
      if (!a.photoPath) continue;

      const fullPath = getApenadoPhotoPath(a.photoPath);
      const fileExists = existsSync(fullPath);

      if (!fileExists) {
        // Tenta pegar o sipeId do relacionamento
        let sipeId = a.sipeImportacoes?.[0]?.sipeId || null;

        // Se não tiver pelo relacionamento, tenta extrair do próprio photoPath (ex: sipe-38296.webp)
        if (!sipeId) {
          const match = a.photoPath.match(/sipe-(\d+)\.webp/);
          if (match) {
            sipeId = parseInt(match[1]);
          }
        }

        missingPhotos.push({
          id: a.id,
          name: a.name,
          photoPath: a.photoPath,
          sipeId
        });

        if (sipeId) {
          sipeIdsToSync.push(sipeId);
        }
      }
    }

    console.log(`[FOTOS-CHECK] Fotos ausentes detectadas no disco: ${missingPhotos.length}`);
    console.log(`[FOTOS-CHECK] SIPE IDs válidos identificados para sincronização: ${sipeIdsToSync.length}`);

    let syncJobId = null;
    let syncStatus = 'skipped';

    // 3. Se solicitado e houver IDs ausentes, disparar sincronização automática no SIPE
    if (sync && sipeIdsToSync.length > 0) {
      const activeJob = await prisma.sipeSyncJob.findFirst({
        where: { status: 'RUNNING' },
      });
      const sipeState = getSipeState();

      if (activeJob || sipeState?.status === 'RUNNING') {
        syncStatus = 'error_another_job_running';
      } else {
        const uniqueIds = [...new Set(sipeIdsToSync)].sort((a, b) => a - b);

        const job = await prisma.sipeSyncJob.create({
          data: {
            tipo: 'IDS_MANUAIS',
            unidade: 'GLOBAL',
            unidadeNome: `Restaurador Automático: ${uniqueIds.length} foto(s) ausente(s)`,
            status: 'RUNNING',
            idsColetados: JSON.stringify(uniqueIds),
            total: uniqueIds.length,
            fase: 'Sincronização de fotos ausentes...',
            iniciadoEm: new Date(),
            criadoPor: user.id,
          },
        });

        startSipeSync(job.id, 'GLOBAL', 'python-sdk');
        syncJobId = job.id;
        syncStatus = 'started';
        console.log(`[FOTOS-CHECK] Job de sincronização automática criado com ID: ${job.id}`);
      }
    }

    return NextResponse.json({
      success: true,
      totalComCaminho: apenados.length,
      totalFotosAusentes: missingPhotos.length,
      sipeIdsIdentificados: sipeIdsToSync.length,
      syncStatus,
      syncJobId,
      amostraAusentes: missingPhotos.slice(0, 10)
    });

  } catch (error: any) {
    console.error('[FOTOS-CHECK] Erro ao verificar fotos ausentes:', error);
    return NextResponse.json({ error: 'Erro interno ao verificar fotos', details: error.message }, { status: 500 });
  }
}
