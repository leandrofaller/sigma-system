/**
 * API de Eventos do Mural
 * GET  /api/events - Listar eventos (com filtros)
 * POST /api/events - Criar novo evento
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    // Filtros
    const { searchParams } = new URL(req.url)
    const mes = searchParams.get('mes') // YYYY-MM
    const categoria = searchParams.get('categoria')
    const pagina = parseInt(searchParams.get('page') || '1')
    const limite = 20

    // Montar where clause
    const where: any = {
      deletadoEm: null, // Não incluir soft-deleted
    }

    // Filtro por mês
    if (mes) {
      const [ano, mesNum] = mes.split('-')
      const inicio = new Date(`${ano}-${mesNum}-01T00:00:00Z`)
      const fim = new Date(inicio)
      fim.setMonth(fim.getMonth() + 1)

      where.dataEvento = {
        gte: inicio,
        lt: fim,
      }
    }

    // Filtro por categoria
    if (categoria) {
      where.categoria = categoria
    }

    // Buscar eventos
    const [eventos, total] = await Promise.all([
      prisma.occurrenceEvent.findMany({
        where,
        include: {
          anexos: {
            where: { deletadoEm: null },
          },
          criadoByUser: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { dataEvento: 'desc' },
        skip: (pagina - 1) * limite,
        take: limite,
      }),
      prisma.occurrenceEvent.count({ where }),
    ])

    return NextResponse.json({
      eventos,
      total,
      pagina,
      paginas: Math.ceil(total / limite),
    })
  } catch (err) {
    console.error('[Events GET] Erro:', err)
    return NextResponse.json(
      { error: 'Erro ao buscar eventos' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const user = session.user as any
    const body = await req.json()

    const { titulo, descricao, categoria, dataEvento } = body

    // Validação
    if (!titulo?.trim()) {
      return NextResponse.json(
        { error: 'Título é obrigatório' },
        { status: 400 }
      )
    }

    if (!dataEvento) {
      return NextResponse.json(
        { error: 'Data do evento é obrigatória' },
        { status: 400 }
      )
    }

    // Criar evento
    const evento = await prisma.occurrenceEvent.create({
      data: {
        titulo: titulo.trim(),
        descricao: descricao?.trim() || null,
        categoria: categoria?.trim() || null,
        dataEvento: new Date(dataEvento),
        criadoPor: user.id,
      },
      include: {
        criadoByUser: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })

    // Log de auditoria
    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.CREATE_EVENT,
      details: { eventoId: evento.id, titulo: evento.titulo },
      request: req,
    })

    return NextResponse.json(evento, { status: 201 })
  } catch (err) {
    console.error('[Events POST] Erro:', err)
    return NextResponse.json(
      { error: 'Erro ao criar evento' },
      { status: 500 }
    )
  }
}
