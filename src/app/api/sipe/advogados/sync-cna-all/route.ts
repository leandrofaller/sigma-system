import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { startCnaAllSync } from '@/lib/sipe-scraper'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  // ── Prevent duplicate active jobs ──
  const activeJob = await prisma.sipeSyncJob.findFirst({
    where: { status: 'RUNNING' },
  })
  if (activeJob) {
    return NextResponse.json(
      { error: 'Já existe uma sincronização em andamento. Aguarde sua conclusão antes de iniciar outra.' },
      { status: 409 }
    )
  }

  // Buscar todos os advogados que possuem OAB cadastrada no sistema
  const advogados = await prisma.sipeAdvogado.findMany({
    where: {
      oab: { not: null },
    },
    select: {
      id: true,
      oab: true,
      nome: true,
    },
  })

  if (advogados.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum advogado com OAB cadastrada para sincronizar.' },
      { status: 400 }
    )
  }

  // Criar o Job de Sincronização no banco de dados para acompanhamento em tempo real
  const job = await prisma.sipeSyncJob.create({
    data: {
      tipo: 'ADVOGADOS_CNA',
      unidade: 'ALL',
      unidadeNome: 'CNA - Cadastro Nacional dos Advogados',
      status: 'RUNNING',
      total: advogados.length,
      processado: 0,
      erros: 0,
      iniciadoEm: new Date(),
      criadoPor: session.user.id,
      fase: 'Iniciando',
      log: `Iniciando sincronização exclusiva de fotos/dados do CNA para ${advogados.length} advogados...`,
    },
  })

  // Disparar o processo em background
  startCnaAllSync(job.id)

  return NextResponse.json({
    success: true,
    jobId: job.id,
    message: `Sincronização de fotos/dados do CNA iniciada com sucesso para ${advogados.length} advogados.`,
  })
}
