import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const ciencias = await prisma.relintCiencia.findMany({
    where: { relintId: id },
    include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ ciencias })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const user = session.user as any
  if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Apenas administradores podem dar ciência' }, { status: 403 })
  }

  const { id } = await params

  const relint = await prisma.relint.findUnique({ where: { id }, select: { id: true, status: true, number: true } })
  if (!relint) return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 })
  if (relint.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Ciência só pode ser dada em relatórios publicados' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? null

  try {
    const ciencia = await prisma.relintCiencia.create({
      data: { relintId: id, userId: user.id, ip },
      include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
    })

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.EDIT_RELINT,
      entity: 'RelintCiencia',
      entityId: id,
      details: { info: `Ciência registrada no ${relint.number}` },
      request: req,
    })

    return NextResponse.json({ ciencia }, { status: 201 })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Você já deu ciência neste relatório' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
