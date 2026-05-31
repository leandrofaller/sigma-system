import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

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
      atualizadoPor
    } = body

    // Validar que atualizadoPor está presente
    if (!atualizadoPor) {
      return NextResponse.json(
        { success: false, message: 'atualizadoPor é obrigatório' },
        { status: 400 }
      )
    }

    // Montar update apenas com campos de inteligência
    const updateData: any = {
      atualizadoPor,
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

    return NextResponse.json({
      success: true,
      apenado,
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
