import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { unaccentParam } from '@/lib/search'
import { syncMapaFromAipAsync } from '@/lib/mapa-faccoes-aip-sync'

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
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const body = await request.json()
    const { sipeApenadoId } = body
    const cadastradoPor = (session.user as any).id

    if (!sipeApenadoId) {
      return NextResponse.json(
        { success: false, message: 'sipeApenadoId é obrigatório' },
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

    syncMapaFromAipAsync(novoApenado.id, cadastradoPor)

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
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20')))
    const q = unaccentParam(searchParams.get('q'))
    const unidade = unaccentParam(searchParams.get('unidade'))
    const faccao = unaccentParam(searchParams.get('faccao'))
    const facaoReal = unaccentParam(searchParams.get('facaoReal'))
    const sipeIdParam = searchParams.get('sipeId')
    const skip = (page - 1) * limit

    // Busca direta por sipeId (retorno rápido sem paginação)
    if (sipeIdParam) {
      const sipeId = parseInt(sipeIdParam)
      if (!isNaN(sipeId)) {
        const apenado = await prisma.aIPApenado.findUnique({
          where: { sipeId },
          include: { fotoVisitantes: true }
        })
        if (!apenado) return NextResponse.json({ apenados: [], total: 0, page: 1, limit, totalPages: 0 })
        
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

        return NextResponse.json({ apenados: [apenadoFormatado], total: 1, page: 1, limit, totalPages: 1 })
      }
    }

    // Build raw SQL WHERE with immutable_unaccent
    let whereClause = 'WHERE 1=1'
    const params: any[] = []
    let idx = 1

    if (q) {
      const pattern = `%${q}%`
      whereClause += ` AND (
        immutable_unaccent(nome) ILIKE immutable_unaccent($${idx})
        OR COALESCE(cpf,'') ILIKE $${idx}
        OR immutable_unaccent(COALESCE("nomeMae",'')) ILIKE immutable_unaccent($${idx})
        OR immutable_unaccent(COALESCE(vulgo,'')) ILIKE immutable_unaccent($${idx})
      )`
      params.push(pattern)
      idx++
    }

    if (unidade) {
      whereClause += ` AND immutable_unaccent(COALESCE(unidade,'')) ILIKE immutable_unaccent($${idx})`
      params.push(`%${unidade}%`)
      idx++
    }

    if (faccao) {
      whereClause += ` AND immutable_unaccent(COALESCE(faccao,'')) ILIKE immutable_unaccent($${idx})`
      params.push(`%${faccao}%`)
      idx++
    }

    if (facaoReal) {
      whereClause += ` AND immutable_unaccent(COALESCE("facaoRealNome",'')) ILIKE immutable_unaccent($${idx})`
      params.push(`%${facaoReal}%`)
      idx++
    }

    // Count + paginated IDs
    const countQuery = `SELECT COUNT(*)::int AS total FROM aip_apenados ${whereClause}`
    const idsQuery = `SELECT id FROM aip_apenados ${whereClause} ORDER BY "cadastradoEm" DESC, nome ASC LIMIT $${idx} OFFSET $${idx + 1}`

    const [countResult, idRows] = await Promise.all([
      prisma.$queryRawUnsafe<{ total: number }[]>(countQuery, ...params),
      prisma.$queryRawUnsafe<{ id: string }[]>(idsQuery, ...params, limit, skip),
    ])

    const total = countResult[0]?.total ?? 0
    const totalPages = Math.ceil(total / limit)
    const ids = idRows.map(r => r.id)

    // Fetch full records with Prisma includes
    const apenados = ids.length > 0
      ? await prisma.aIPApenado.findMany({
          where: { id: { in: ids } },
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
        })
      : []

    // Buscar todos os vínculos para marcar quem possui ligações
    const todosVinculos = await prisma.aIPVinculo.findMany({
      select: { apenadoId: true, vinculadoComId: true }
    })

    const idsComVinculos = new Set<string>()
    for (const v of todosVinculos) {
      if (v.apenadoId) idsComVinculos.add(v.apenadoId)
      if (v.vinculadoComId) idsComVinculos.add(v.vinculadoComId)
    }

    // Coleta IDs de cadastradoPor e atualizadoPor para carregar nomes correspondentes
    const userIds = [...new Set([
      ...apenados.map(a => a.cadastradoPor),
      ...apenados.map(a => a.atualizadoPor).filter(Boolean) as string[]
    ])].filter(Boolean)

    const usuarios = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true }
        })
      : []
    const usuarioMap = new Map(usuarios.map(u => [u.id, u.name]))

    const apenadosFormatados = apenados.map(a => ({
      ...a,
      temVinculos: idsComVinculos.has(a.id),
      cadastradoPorNome: usuarioMap.get(a.cadastradoPor) || a.cadastradoPor,
      atualizadoPorNome: a.atualizadoPor ? (usuarioMap.get(a.atualizadoPor) || a.atualizadoPor) : null
    }))

    return NextResponse.json({
      apenados: apenadosFormatados,
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
