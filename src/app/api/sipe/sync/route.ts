import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  startSipeSync,
  scrapeFaccoes,
  detectAndMarkCrashedJobs,
} from '@/lib/sipe-scraper'

const UNIDADES: Record<string, string> = {
  '3': 'CENTRO DE DETENÇÃO PROVISÓRIO DE PORTO VELHO - CDPPVH',
  '1': 'PENITENCIÁRIA ESTADUAL EDVAN MARIANO ROSENDO - PANDA',
  '5': 'PENITENCIÁRIA ESTADUAL SUELY MARIA MENDONÇA',
  '6': 'UNIDADE PROVISÓRIA DE SEGURANÇA ESPECIAL - UPES',
  '9': 'COLÔNIA AGRÍCOLA PENAL ÊNIO PINHEIRO DOS SANTOS',
  '16': 'PENITENCIÁRIA ESTADUAL ARUANA - PEA',
  '17': 'PENITENCIÁRIA ESTADUAL MILTON SOARES DE CARVALHO',
  '91': 'PENITENCIÁRIA ESTADUAL JORGE THIAGO AGUIAR AFONSO',
  '12': 'CENTRO DE RESSOCIALIZAÇÃO VALE DO GUAPORÉ - CRVG',
  '25': 'CENTRO DE RESSOCIALIZAÇÃO JONAS FERRETI',
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  // Auto-detect crashed jobs before starting new one
  await detectAndMarkCrashedJobs()

  // Parse body safely (allow empty body)
  let body: { unidadeId?: string; tipo?: string; resumeJobId?: string } = {}
  try {
    const contentLength = req.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > 0) {
      body = await req.json()
    }
  } catch {
    // If no body or invalid JSON, use defaults
    body = {}
  }

  const { unidadeId = '3', tipo = 'APENADOS', resumeJobId } = body

  // ── Resume an interrupted job ──
  if (resumeJobId) {
    const existing = await prisma.sipeSyncJob.findUnique({
      where: { id: resumeJobId },
    })
    if (!existing || existing.status !== 'INTERRUPTED') {
      return NextResponse.json(
        { error: 'Job não encontrado ou não está interrompido' },
        { status: 400 }
      )
    }

    await prisma.sipeSyncJob.update({
      where: { id: resumeJobId },
      data: { status: 'RUNNING', ultimaAtividade: new Date() },
    })

    startSipeSync(resumeJobId, existing.unidade ?? unidadeId)
    return NextResponse.json({ jobId: resumeJobId, status: 'RUNNING', resumed: true })
  }

  // ── Prevent duplicate active jobs ──
  const jobAtivo = await prisma.sipeSyncJob.findFirst({
    where: { status: 'RUNNING' },
  })
  if (jobAtivo) {
    return NextResponse.json(
      { error: 'Já existe uma sincronização em andamento', jobId: jobAtivo.id },
      { status: 409 }
    )
  }

  const unidadeNome = UNIDADES[unidadeId] ?? `Unidade ${unidadeId}`

  // ── Factions-only sync ──
  if (tipo === 'FACCOES') {
    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'FACCOES',
        unidade: unidadeId,
        unidadeNome,
        status: 'RUNNING',
        iniciadoEm: new Date(),
        criadoPor: session.user.id,
      },
    })

    scrapeFaccoes()
      .then(() =>
        prisma.sipeSyncJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', finalizadoEm: new Date() },
        })
      )
      .catch((err) =>
        prisma.sipeSyncJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            finalizadoEm: new Date(),
            log: String(err),
          },
        })
      )

    return NextResponse.json({ jobId: job.id, status: 'RUNNING' })
  }

  // ── Advogados-only sync ──
  if (tipo === 'ADVOGADOS') {
    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'ADVOGADOS',
        unidade: unidadeId,
        unidadeNome,
        status: 'RUNNING',
        iniciadoEm: new Date(),
        criadoPor: session.user.id,
      },
    })

    startSipeSync(job.id, unidadeId)
    return NextResponse.json({ jobId: job.id, status: 'RUNNING' })
  }

  // ── Full apenados + advogados sync ──
  const job = await prisma.sipeSyncJob.create({
    data: {
      tipo: 'APENADOS',
      unidade: unidadeId,
      unidadeNome,
      status: 'RUNNING',
      iniciadoEm: new Date(),
      criadoPor: session.user.id,
    },
  })

  startSipeSync(job.id, unidadeId)
  return NextResponse.json({ jobId: job.id, status: 'RUNNING' })
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  // Auto-detect crashed jobs on every list refresh
  await detectAndMarkCrashedJobs()

  const jobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    // Don't send the full idsColetados (can be large)
    select: {
      id: true,
      status: true,
      tipo: true,
      unidade: true,
      unidadeNome: true,
      total: true,
      processado: true,
      erros: true,
      log: true,
      fase: true,
      ultimoIdProcessado: true,
      iniciadoEm: true,
      finalizadoEm: true,
      ultimaAtividade: true,
      createdAt: true,
      criadoPor: true,
    },
  })

  return NextResponse.json(jobs)
}
