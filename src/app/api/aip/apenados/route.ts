import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

/**
 * POST /api/aip/apenados
 * Cadastra um apenado do SIPE em AIP
 *
 * Body:
 * {
 *   sipeApenadoId: number (sipeId de SipeApenadoImportado)
 *   cadastradoPor: string (userId)
 * }
 *
 * Response:
 * {
 *   success: boolean
 *   apenadoId?: string
 *   message: string
 *   duplicate?: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sipeApenadoId, cadastradoPor } = body

    if (!sipeApenadoId || !cadastradoPor) {
      return NextResponse.json(
        { success: false, message: 'sipeApenadoId e cadastradoPor são obrigatórios' },
        { status: 400 }
      )
    }

    // Verificar se existe em SipeApenadoImportado
    const sipeApenado = await db.sipeApenadoImportado.findUnique({
      where: { sipeId: sipeApenadoId },
      include: { faccao: true }
    })

    if (!sipeApenado) {
      return NextResponse.json(
        { success: false, message: 'Apenado não encontrado no SIPE' },
        { status: 404 }
      )
    }

    // Verificar se já existe em AIP
    const existeEmAIP = await db.aIPApenado.findUnique({
      where: { sipeApenadoId }
    })

    if (existeEmAIP) {
      return NextResponse.json(
        {
          success: false,
          message: 'Apenado já cadastrado em AIP',
          duplicate: true,
          apenadoId: existeEmAIP.id
        },
        { status: 409 }
      )
    }

    // Criar novo registro em AIP copiando dados do SIPE
    const novoApenado = await db.aIPApenado.create({
      data: {
        sipeApenadoId,
        sipeId: sipeApenado.sipeId,

        // Dados SIPE (copiados inicialmente)
        nome: sipeApenado.nome,
        cpf: sipeApenado.cpf,
        rg: sipeApenado.rg,
        dataNascimento: sipeApenado.dataNascimento,
        sexo: sipeApenado.sexo,
        etnia: sipeApenado.etnia,

        unidade: sipeApenado.unidade,
        cela: sipeApenado.cela,
        regime: sipeApenado.regime,
        situacao: sipeApenado.situacao,
        dataEntrada: sipeApenado.dataEntrada,
        dataPrisao: sipeApenado.dataPrisao,
        tempoPena: sipeApenado.tempoPena,

        faccao: sipeApenado.faccao ? sipeApenado.faccao.nome : null,
        monitorado: sipeApenado.monitorado,
        intramuro: sipeApenado.intramuro,

        // Endereço
        logradouro: sipeApenado.logradouro,
        numero: sipeApenado.numero,
        bairro: sipeApenado.bairro,
        cidade: sipeApenado.cidade,
        uf: sipeApenado.uf,
        cep: sipeApenado.cep,

        // Metadata
        ultimaSincAt: new Date(),
        cadastradoPor
      }
    })

    return NextResponse.json(
      {
        success: true,
        apenadoId: novoApenado.id,
        message: 'Apenado cadastrado em AIP com sucesso'
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[AIP] Erro ao cadastrar apenado:', error)
    return NextResponse.json(
      { success: false, message: 'Erro interno ao cadastrar apenado' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/aip/apenados
 * Lista apenados em AIP com filtros e paginação
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - q: string (busca por nome, cpf)
 * - unidade: string (filtro por unidade)
 * - faccao: string (filtro por facção SIPE)
 * - facaoReal: string (filtro por facção de inteligência)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20')))
    const q = searchParams.get('q') || ''
    const unidade = searchParams.get('unidade') || ''
    const faccao = searchParams.get('faccao') || ''
    const facaoReal = searchParams.get('facaoReal') || ''

    // Montar filtros
    const where: any = {}

    if (q) {
      where.OR = [
        { nome: { contains: q, mode: 'insensitive' } },
        { cpf: { contains: q, mode: 'insensitive' } }
      ]
    }

    if (unidade) {
      where.unidade = { contains: unidade, mode: 'insensitive' }
    }

    if (faccao) {
      where.faccao = { contains: faccao, mode: 'insensitive' }
    }

    if (facaoReal) {
      where.facaoRealNome = { contains: facaoReal, mode: 'insensitive' }
    }

    // Contar total
    const total = await db.aIPApenado.count({ where })
    const totalPages = Math.ceil(total / limit)

    // Buscar apenados
    const apenados = await db.aIPApenado.findMany({
      where,
      orderBy: [{ cadastradoEm: 'desc' }, { nome: 'asc' }],
      skip: (page - 1) * limit,
      take: limit
    })

    return NextResponse.json({
      apenados,
      total,
      page,
      limit,
      totalPages
    })
  } catch (error) {
    console.error('[AIP] Erro ao listar apenados:', error)
    return NextResponse.json(
      { success: false, message: 'Erro ao listar apenados' },
      { status: 500 }
    )
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
export async function PUT(request: NextRequest) {
  try {
    const { searchParams, pathname } = new URL(request.url)
    const id = pathname.split('/').pop()

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

    // Se está atualizando facão real pela primeira vez, registrar data
    if (facaoRealNome && !facaoNivel) {
      updateData.facaoDataVerificacao = new Date()
    }

    const apenado = await db.aIPApenado.update({
      where: { id },
      data: updateData
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
