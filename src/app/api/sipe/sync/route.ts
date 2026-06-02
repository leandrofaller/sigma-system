import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  startSipeSync,
  scrapeFaccoes,
  detectAndMarkCrashedJobs,
  scrapeUnidadesPrisionais,
} from '@/lib/sipe-scraper'

const UNIDADES: Record<string, string> = {
  '3': 'CDPPVH - Centro de Detenção Provisório de Porto Velho',
  '1': 'PANDA - Penitenciária Edvan Mariano Rosendo',
  '5': 'Penitenciária Estadual Suely Maria Mendonça',
  '6': 'UPES - Unidade Provisória de Segurança Especial',
  '9': 'CAPEP I - Colônia Agrícola Penal Ênio Pinheiro',
  '16': 'PEA - Penitenciária Estadual Aruana',
  '17': 'Penitenciária Milton Soares de Carvalho',
  '91': 'Penitenciária Jorge Thiago Aguiar Afonso',
  '12': 'CRVG - Centro de Ressocialização Vale do Guaporé',
  '25': 'Centro de Ressocialização Jonas Ferreti',
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
  let body: { unidadeId?: string; tipo?: string; resumeJobId?: string; idsManual?: number[] } = {}
  try {
    const contentLength = req.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > 0) {
      body = await req.json()
    }
  } catch {
    // If no body or invalid JSON, use defaults
    body = {}
  }

  const { unidadeId = '3', tipo = 'APENADOS', resumeJobId, idsManual } = body

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

  let unidadeNome = UNIDADES[unidadeId] ?? `Unidade ${unidadeId}`
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'sipe_unidades' },
    })
    if (config && Array.isArray(config.value)) {
      const list = config.value as Array<{ id: string; nome: string }>
      const found = list.find((u) => u.id === unidadeId)
      if (found) {
        unidadeNome = found.nome
      }
    }
  } catch {}

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
      .then(() => {
        console.log(`[SYNC] ✅ scrapeFaccoes completado com sucesso`)
        return prisma.sipeSyncJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', finalizadoEm: new Date() },
        })
      })
      .catch((err) => {
        const errMsg = String(err)
        console.log(`[SYNC] ❌ scrapeFaccoes falhou: ${errMsg}`)
        return prisma.sipeSyncJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            finalizadoEm: new Date(),
            log: errMsg,
          },
        })
      })

    return NextResponse.json({ jobId: job.id, status: 'RUNNING' })
  }

  // ── Unidades-only sync ──
  if (tipo === 'UNIDADES') {
    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'UNIDADES',
        unidade: 'ALL',
        unidadeNome: 'TODAS AS UNIDADES',
        status: 'RUNNING',
        iniciadoEm: new Date(),
        criadoPor: session.user.id,
      },
    })

    startSipeSync(job.id, 'ALL')
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

  // ── Extramuros sync (por situação no banco local) ──
  if (tipo === 'EXTRAMUROS') {
    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'EXTRAMUROS',
        unidade: 'EXTRAMUROS',
        unidadeNome: 'Extramuros (Em Liberdade, Fuga, etc.)',
        status: 'RUNNING',
        iniciadoEm: new Date(),
        criadoPor: session.user.id,
      },
    })

    startSipeSync(job.id, 'EXTRAMUROS')
    return NextResponse.json({ jobId: job.id, status: 'RUNNING' })
  }

  // ── Global sync (todas as unidades via /apenados/index) ──
  if (tipo === 'GLOBAL') {
    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'GLOBAL',
        unidade: 'GLOBAL',
        unidadeNome: null,
        status: 'RUNNING',
        iniciadoEm: new Date(),
        criadoPor: session.user.id,
      },
    })

    startSipeSync(job.id, 'GLOBAL')
    return NextResponse.json({ jobId: job.id, status: 'RUNNING' })
  }

  // ── IDs manuais ──
  if (tipo === 'IDS_MANUAIS') {
    const ids = (idsManual ?? [])
      .map((id) => parseInt(String(id)))
      .filter((id) => Number.isInteger(id) && id > 0)

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Nenhum SIPE ID válido fornecido' }, { status: 400 })
    }

    const uniqueIds = [...new Set(ids)].sort((a, b) => a - b)

    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'IDS_MANUAIS',
        unidade: unidadeId,
        unidadeNome: `${uniqueIds.length} ID(s) manual(is) — ${unidadeNome}`,
        status: 'RUNNING',
        idsColetados: JSON.stringify(uniqueIds),
        total: uniqueIds.length,
        fase: 'Aguardando início...',
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
    take: 100, // Aumentado de 20 para 100 registros
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
