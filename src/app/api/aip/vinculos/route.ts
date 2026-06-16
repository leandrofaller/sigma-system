import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'OPERATOR' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const apenadoId = searchParams.get('apenadoId')

  try {
    if (apenadoId) {
      // Buscar todos os vínculos onde o apenado em questão está envolvido
      const vinculos = await prisma.aIPVinculo.findMany({
        where: {
          OR: [
            { apenadoId: apenadoId },
            { vinculadoComId: apenadoId }
          ]
        },
        include: {
          apenado: true // Inclui o apenado da ponta principal
        }
      })

      // Resolver o "outro" apenado para cada vínculo
      const vinculosFormatados = await Promise.all(vinculos.map(async (v) => {
        const isPrincipal = v.apenadoId === apenadoId
        const outroId = isPrincipal ? v.vinculadoComId : v.apenadoId

        let outroApenado = null
        if (outroId) {
          outroApenado = await prisma.aIPApenado.findUnique({
            where: { id: outroId }
          })
        }

        return {
          id: v.id,
          apenadoId: v.apenadoId,
          vinculadoComId: v.vinculadoComId,
          tipo: v.tipo,
          forca: v.forca,
          notaVinculo: v.notaVinculo,
          documentadoEm: v.documentadoEm,
          documentadoPor: v.documentadoPor,
          outroApenado: outroApenado ? {
            id: outroApenado.id,
            sipeId: outroApenado.sipeId,
            nome: outroApenado.nome,
            cpf: outroApenado.cpf,
            unidade: outroApenado.unidade,
            cela: outroApenado.cela,
            regime: outroApenado.regime,
            photoPath: outroApenado.photoPath,
            facaoRealNome: outroApenado.facaoRealNome || outroApenado.faccao
          } : null,
          direction: isPrincipal ? 'outgoing' : 'incoming'
        }
      }))

      return NextResponse.json({ vinculos: vinculosFormatados })
    } else {
      // Retorna todos os vínculos se não for passado apenadoId
      const vinculos = await prisma.aIPVinculo.findMany({
        include: {
          apenado: {
            select: {
              id: true,
              nome: true,
              photoPath: true,
              facaoRealNome: true,
              faccao: true
            }
          }
        }
      })

      const vinculosFormatados = await Promise.all(vinculos.map(async (v) => {
        let outroApenado = null
        if (v.vinculadoComId) {
          outroApenado = await prisma.aIPApenado.findUnique({
            where: { id: v.vinculadoComId },
            select: {
              id: true,
              nome: true,
              photoPath: true,
              facaoRealNome: true,
              faccao: true
            }
          })
        }

        return {
          id: v.id,
          apenadoId: v.apenadoId,
          apenado: v.apenado,
          vinculadoComId: v.vinculadoComId,
          outroApenado,
          tipo: v.tipo,
          forca: v.forca,
          notaVinculo: v.notaVinculo,
          documentadoEm: v.documentadoEm,
          documentadoPor: v.documentadoPor
        }
      }))

      return NextResponse.json({ vinculos: vinculosFormatados })
    }
  } catch (error) {
    console.error('[AIP] Erro ao buscar vínculos:', error)
    return NextResponse.json({ error: 'Erro ao processar requisição' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'OPERATOR' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { apenadoId, vinculadoComId, tipo, forca, notaVinculo } = body

    if (!apenadoId || !vinculadoComId || !tipo) {
      return NextResponse.json({ error: 'Campos apenadoId, vinculadoComId e tipo são obrigatórios' }, { status: 400 })
    }

    if (apenadoId === vinculadoComId) {
      return NextResponse.json({ error: 'Não é possível criar um vínculo de um apenado com ele mesmo' }, { status: 400 })
    }

    // Verificar se ambos os apenados existem no AIP
    const [ap1, ap2] = await Promise.all([
      prisma.aIPApenado.findUnique({ where: { id: apenadoId } }),
      prisma.aIPApenado.findUnique({ where: { id: vinculadoComId } })
    ])

    if (!ap1 || !ap2) {
      return NextResponse.json({ error: 'Um ou ambos os apenados não estão cadastrados no AIP' }, { status: 404 })
    }

    // Prevenir duplicidade de vínculo na mesma direção ou direção contrária com o mesmo tipo
    const vinculoExistente = await prisma.aIPVinculo.findFirst({
      where: {
        OR: [
          { apenadoId, vinculadoComId, tipo },
          { apenadoId: vinculadoComId, vinculadoComId: apenadoId, tipo }
        ]
      }
    })

    if (vinculoExistente) {
      return NextResponse.json({ error: 'Este vínculo já está registrado' }, { status: 409 })
    }

    const userName = session.user.name || 'Agente'

    const novoVinculo = await prisma.aIPVinculo.create({
      data: {
        apenadoId,
        vinculadoComId,
        tipo,
        forca: forca || 'suspeita',
        notaVinculo,
        documentadoPor: userName
      }
    })

    return NextResponse.json({ success: true, vinculo: novoVinculo }, { status: 201 })
  } catch (error) {
    console.error('[AIP] Erro ao criar vínculo:', error)
    return NextResponse.json({ error: 'Erro ao processar requisição' }, { status: 500 })
  }
}
