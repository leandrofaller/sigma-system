import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { containsNormalizedText, normalizeSearchText } from '@/lib/search'

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

    // Verificar se existe em SipeApenadoImportado com visitantes incluídos
    const sipeApenado = await prisma.sipeApenadoImportado.findUnique({
      where: { sipeId: sipeApenadoId },
      include: {
        faccao: true,
        vinculosVisitante: {
          include: {
            visitante: true
          }
        }
      }
    })

    if (!sipeApenado) {
      return NextResponse.json(
        { success: false, message: 'Apenado não encontrado no SIPE' },
        { status: 404 }
      )
    }

    // Verificar se já existe em AIP
    const existeEmAIP = await prisma.aIPApenado.findUnique({
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

    // Criar novo registro em AIP copiando TODOS os dados do SIPE
    const novoApenado = await prisma.aIPApenado.create({
      data: {
        sipeApenadoId,
        sipeId: sipeApenado.sipeId,

        // ============ DADOS PESSOAIS ============
        nome: sipeApenado.nome,
        nomeOutro: sipeApenado.nomeOutro,
        cpf: sipeApenado.cpf,
        rg: sipeApenado.rg,
        rgOrgao: sipeApenado.rgOrgao,
        dataNascimento: sipeApenado.dataNascimento,
        sexo: sipeApenado.sexo,
        etnia: sipeApenado.etnia,
        naturalidade: sipeApenado.naturalidade,
        orientacaoSexual: sipeApenado.orientacaoSexual,
        tipoSanguineo: sipeApenado.tipoSanguineo,
        grauInstrucao: sipeApenado.grauInstrucao,
        religiao: sipeApenado.religiao,
        estadoCivil: sipeApenado.estadoCivil,
        nomeConjuge: sipeApenado.nomeConjuge,
        qtdFilhos: sipeApenado.qtdFilhos,
        nomeMae: sipeApenado.nomeMae,
        nomePai: sipeApenado.nomePai,
        telefone: sipeApenado.telefone,
        rji: sipeApenado.rji,

        // ============ DADOS PRISIONAIS ============
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
        presoOriundo: sipeApenado.presoOriundo,
        oficioEntrada: sipeApenado.oficioEntrada,
        celeAtual: sipeApenado.celeAtual,
        ultimaMovimentacao: sipeApenado.ultimaMovimentacao,

        // ============ ENDEREÇO RESIDENCIAL ============
        logradouro: sipeApenado.logradouro,
        numero: sipeApenado.numero,
        complemento: sipeApenado.complemento,
        bairro: sipeApenado.bairro,
        cidade: sipeApenado.cidade,
        uf: sipeApenado.uf,
        cep: sipeApenado.cep,

        // ============ FOTOS ============
        photoPath: sipeApenado.photoPath,

        // ============ METADATA ============
        ultimaSincAt: new Date(),
        cadastradoPor
      }
    })

    // Copiar visitantes para AIPFotoVisitante
    if (sipeApenado.vinculosVisitante && sipeApenado.vinculosVisitante.length > 0) {
      await Promise.all(
        sipeApenado.vinculosVisitante.map(async (v) => {
          if (v.visitante) {
            await prisma.aIPFotoVisitante.create({
              data: {
                apenadoId: novoApenado.id,
                visitanteId: v.visitante.id,
                nomeVisitante: v.visitante.nome,
                cpfVisitante: v.visitante.cpf,
                parentescoVisitante: v.visitante.parentesco || '',
                ativoVisitante: v.ativo,
                photoPath: v.visitante.photoPath,
                descricao: 'Importado do SIPE'
              }
            }).catch(e => {
              console.error(`Erro ao importar visitante ${v.visitante?.id} para AIP:`, e);
            });
          }
        })
      );
    }

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
    const q = normalizeSearchText(searchParams.get('q'))
    const unidade = normalizeSearchText(searchParams.get('unidade'))
    const faccao = normalizeSearchText(searchParams.get('faccao'))
    const facaoReal = normalizeSearchText(searchParams.get('facaoReal'))

    const filteredApenados = (await prisma.aIPApenado.findMany({
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
      },
      orderBy: [{ cadastradoEm: 'desc' }, { nome: 'asc' }],
    })).filter((apenado) => {
      if (q && !containsNormalizedText(apenado.nome, q) && !containsNormalizedText(apenado.cpf, q)) {
        return false
      }

      if (unidade && !containsNormalizedText(apenado.unidade, unidade)) {
        return false
      }

      if (faccao && !containsNormalizedText(apenado.faccao, faccao)) {
        return false
      }

      if (facaoReal && !containsNormalizedText(apenado.facaoRealNome, facaoReal)) {
        return false
      }

      return true
    })

    const total = filteredApenados.length
    const totalPages = Math.ceil(total / limit)
    const apenados = filteredApenados.slice((page - 1) * limit, page * limit)

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
