import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { startServidoresSync } from '@/lib/sejus-servidores-scraper';

// GET - Retorna o último job do tipo SERVIDORES
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 });
  }

  try {
    const job = await prisma.sipeSyncJob.findFirst({
      where: { tipo: 'SERVIDORES' },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(job || null);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

// POST - Inicia uma nova sincronização de servidores
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 });
  }

  try {
    // Verifica se já existe um job ativo rodando (de qualquer tipo) para evitar colisões
    const activeJob = await prisma.sipeSyncJob.findFirst({
      where: { status: 'RUNNING' }
    });

    if (activeJob || (globalThis as any).__sipeState?.status === 'RUNNING') {
      const activeId = activeJob?.id || (globalThis as any).__sipeState?.jobId || 'desconhecido';
      return NextResponse.json(
        { error: 'Já existe uma sincronização ativa em andamento.', jobId: activeId },
        { status: 409 }
      );
    }

    // Cria o novo job do tipo SERVIDORES
    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'SERVIDORES',
        unidade: 'ALL',
        unidadeNome: 'SGP SEJUS - Servidores',
        status: 'RUNNING',
        iniciadoEm: new Date(),
        criadoPor: session.user.id
      }
    });

    // Inicia o scraper de servidores em background
    startServidoresSync(job.id);

    return NextResponse.json({ jobId: job.id, status: 'RUNNING' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

// DELETE - Interrompe o job de sincronização ativo
export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 });
  }

  try {
    // Seta a flag global de interrupção
    (globalThis as any).__sipeStopFlag = true;

    // Busca o job de servidores ativo
    const activeJob = await prisma.sipeSyncJob.findFirst({
      where: {
        tipo: 'SERVIDORES',
        status: 'RUNNING'
      }
    });

    if (activeJob) {
      await prisma.sipeSyncJob.update({
        where: { id: activeJob.id },
        data: {
          status: 'INTERRUPTED',
          finalizadoEm: new Date(),
          log: activeJob.log ? activeJob.log + '\nSincronização interrompida pelo usuário.' : 'Sincronização interrompida pelo usuário.'
        }
      });

      if ((globalThis as any).__sipeState && (globalThis as any).__sipeState.jobId === activeJob.id) {
        (globalThis as any).__sipeState.status = 'INTERRUPTED';
        (globalThis as any).__sipeState.fase = 'Interrompido';
        (globalThis as any).__sipeState.ultimoLog = 'Sincronização interrompida pelo usuário.';
      }

      return NextResponse.json({ success: true, jobId: activeJob.id });
    }

    return NextResponse.json({ error: 'Nenhum job de servidores ativo em andamento' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
