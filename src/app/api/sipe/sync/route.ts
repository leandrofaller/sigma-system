import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { scrapeApenadosPorUnidade, scrapeFaccoes } from '@/lib/sipe-scraper'

const UNIDADES = {
  '3': 'CENTRO DE DETENÇÃO PROVISÓRIO DE PORTO VELHO - CDPPVH',
  '1': 'PENITENCIÁRIA ESTADUAL EDVAN MARIANO ROSENDO - PANDA',
  '5': 'PENITENCIÁRIA ESTADUAL SUELY MARIA MENDONÇA',
  '6': 'UNIDADE PROVISÓRIA DE SEGURANÇA ESPECIAL - UPES',
  '9': 'COLÔNIA AGRÍCOLA PENAL ÊNIO PINHEIRO DOS SANTOS',
  '16': 'PENITENCIÁRIA ESTADUAL ARUANA - PEA',
  '17': 'PENITENCIÁRIA ESTADUAL MILTON SOARES DE CARVALHO',
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { unidadeId = '3', tipo = 'APENADOS' } = body

  const unidadeNome = UNIDADES[unidadeId as keyof typeof UNIDADES] || `Unidade ${unidadeId}`

  // Verifica se já tem job rodando
  const jobAtivo = await prisma.sipeSyncJob.findFirst({
    where: { status: 'RUNNING' },
  })
  if (jobAtivo) {
    return NextResponse.json({ error: 'Já existe uma sincronização em andamento', jobId: jobAtivo.id }, { status: 409 })
  }

  const job = await prisma.sipeSyncJob.create({
    data: {
      tipo,
      unidade: unidadeId,
      unidadeNome,
      status: 'PENDING',
      criadoPor: session.user.id,
    },
  })

  // Executa em background
  if (tipo === 'FACCOES') {
    scrapeFaccoes().catch(console.error)
  } else {
    scrapeApenadosPorUnidade(job.id, unidadeId, unidadeNome).catch(console.error)
  }

  return NextResponse.json({ jobId: job.id, status: 'PENDING' })
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const jobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(jobs)
}
