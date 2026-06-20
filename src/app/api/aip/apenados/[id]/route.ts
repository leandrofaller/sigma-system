import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

/**
 * GET /api/aip/apenados/{id}
 * Busca detalhes completos de um apenado em AIP
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'ID do apenado é obrigatório' }, { status: 400 })
    }

    const apenado = await prisma.aIPApenado.findUnique({
      where: { id },
      include: {
        fotoVisitantes: true,
        sipeApenado: {
          include: {
            vinculosAdvogado: {
              include: {
                advogado: true
              }
            }
          }
        }
      }
    })

    if (!apenado) {
      return NextResponse.json({ error: 'Apenado não encontrado' }, { status: 404 })
    }

    let cadastradoPorNome = apenado.cadastradoPor
    if (apenado.cadastradoPor) {
      const userCreator = await prisma.user.findUnique({
        where: { id: apenado.cadastradoPor },
        select: { name: true }
      })
      if (userCreator) cadastradoPorNome = userCreator.name
    }

    let atualizadoPorNome = apenado.atualizadoPor
    if (apenado.atualizadoPor) {
      const userUpdater = await prisma.user.findUnique({
        where: { id: apenado.atualizadoPor },
        select: { name: true }
      })
      if (userUpdater) atualizadoPorNome = userUpdater.name
    }

    return NextResponse.json({
      ...apenado,
      cadastradoPorNome,
      atualizadoPorNome
    })
  } catch (error) {
    console.error('[AIP] Erro ao buscar apenado por ID:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

/**
 * PUT /api/aip/apenados/{id}
 * Atualiza campos de inteligência (nunca campos SIPE)
 *
 * Body (apenas campos de inteligência permitidos):
 * {
 *   facaoRealNome?: string
 *   facaoNivel?: string
 *   notasInteligencia?: string
 *   observacoes?: string
 *   atualizadoPor: string (userId)
 * }
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN' && user.role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Acesso negado. Permissão insuficiente para editar registros de inteligência.' }, { status: 403 });
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'ID do apenado não fornecido' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      facaoRealNome,
      facaoNivel,
      notasInteligencia,
      observacoes,
      facaoRelevancia,
      vulgo,
    } = body

    // Montar update apenas com campos de inteligência
    const updateData: any = {
      atualizadoPor: user.id,
      atualizadoEm: new Date()
    }

    if (facaoRealNome !== undefined) updateData.facaoRealNome = facaoRealNome
    if (facaoNivel !== undefined) updateData.facaoNivel = facaoNivel
    if (notasInteligencia !== undefined) updateData.notasInteligencia = notasInteligencia
    if (observacoes !== undefined) updateData.observacoes = observacoes
    if (facaoRelevancia !== undefined) updateData.facaoRelevancia = facaoRelevancia
    if (vulgo !== undefined) updateData.vulgo = vulgo

    // Se está atualizando facão real pela primeira vez, registrar data
    if (facaoRealNome && !facaoNivel) {
      updateData.facaoDataVerificacao = new Date()
    }

    const apenado = await prisma.aIPApenado.update({
      where: { id },
      data: updateData,
      include: {
        fotoVisitantes: true,
        sipeApenado: {
          include: {
            vinculosAdvogado: {
              include: {
                advogado: true
              }
            }
          }
        }
      }
    })

    let cadastradoPorNome = apenado.cadastradoPor
    if (apenado.cadastradoPor) {
      const userCreator = await prisma.user.findUnique({
        where: { id: apenado.cadastradoPor },
        select: { name: true }
      })
      if (userCreator) cadastradoPorNome = userCreator.name
    }

    let atualizadoPorNome = apenado.atualizadoPor
    if (apenado.atualizadoPor) {
      const userUpdater = await prisma.user.findUnique({
        where: { id: apenado.atualizadoPor },
        select: { name: true }
      })
      if (userUpdater) atualizadoPorNome = userUpdater.name
    }

    const apenadoFormatado = {
      ...apenado,
      cadastradoPorNome,
      atualizadoPorNome
    }

    return NextResponse.json({
      success: true,
      apenado: apenadoFormatado,
      message: 'Apenado atualizado com sucesso'
    })
  } catch (error: any) {
    console.error('[AIP] Erro ao atualizar apenado:', error)

    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, message: 'Apenado não encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { success: false, message: 'Erro ao atualizar apenado' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/aip/apenados/{id}
 * Deleta um apenado do AIP (apenas SUPER_ADMIN e ADMIN)
 *
 * Query params:
 * - confirm: boolean (deve ser true para confirmar deleção)
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Validar autenticação e permissão
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: 'Não autenticado' },
        { status: 401 }
      )
    }

    const user = session.user as any
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Acesso negado. Apenas Super Admin e Admin podem deletar.' },
        { status: 403 }
      )
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'ID do apenado não fornecido' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    // Validar confirmação
    const confirm = searchParams.get('confirm') === 'true'
    if (!confirm) {
      return NextResponse.json(
        { success: false, message: 'Deleção não confirmada' },
        { status: 400 }
      )
    }

    // Verificar se apenado existe
    const apenado = await prisma.aIPApenado.findUnique({
      where: { id }
    })

    if (!apenado) {
      return NextResponse.json(
        { success: false, message: 'Apenado não encontrado' },
        { status: 404 }
      )
    }

    // Deletar apenado (cascata deletará fotos de visitantes)
    console.log(`[AIP] Iniciando deleção do apenado: ${id}`)

    try {
      const result = await prisma.aIPApenado.delete({
        where: { id },
        include: {
          fotoVisitantes: true
        }
      })

      console.log(`[AIP] Apenado deletado com sucesso. Fotos removidas: ${result.fotoVisitantes.length}`)
    } catch (deleteError: any) {
      console.error('[AIP] Erro específico ao deletar:', {
        code: deleteError.code,
        message: deleteError.message,
        meta: deleteError.meta,
        apenadoId: id
      })
      throw deleteError
    }

    return NextResponse.json({
      success: true,
      message: 'Apenado deletado com sucesso'
    })
  } catch (error: any) {
    console.error('[AIP] Erro ao deletar apenado:', error)

    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, message: 'Apenado não encontrado' },
        { status: 404 }
      )
    }

    // Erro de constraint ou outro erro
    if (error.code === 'P2003') {
      return NextResponse.json(
        { success: false, message: 'Não é possível deletar: apenado está vinculado a outros registros' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Erro ao deletar apenado',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    )
  }
}
