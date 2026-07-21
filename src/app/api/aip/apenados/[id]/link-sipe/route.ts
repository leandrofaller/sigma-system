import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

/**
 * POST /api/aip/apenados/[id]/link-sipe
 * Vincula um cadastro manual AIP (id) a um registro oficial do SIPE (targetSipeId)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const atualizadoPor = (session.user as any).id

  try {
    const { id } = await params
    const body = await request.json()
    const { targetSipeId } = body

    if (!targetSipeId || typeof targetSipeId !== 'number') {
      return NextResponse.json(
        { success: false, message: 'targetSipeId (número) é obrigatório' },
        { status: 400 }
      )
    }

    // 1. Buscar cadastro manual na AIP
    const aipApenado = await prisma.aIPApenado.findUnique({
      where: { id }
    })

    if (!aipApenado) {
      return NextResponse.json(
        { success: false, message: 'Registro AIP não encontrado' },
        { status: 404 }
      )
    }

    // 2. Buscar apenado importado do SIPE
    const sipeApenado = await prisma.sipeApenadoImportado.findUnique({
      where: { sipeId: targetSipeId }
    })

    if (!sipeApenado) {
      return NextResponse.json(
        { success: false, message: 'Apenado SIPE não encontrado' },
        { status: 404 }
      )
    }

    // 3. Verificar se já existe outro cadastro AIP vinculado a este sipeId
    const existenteComSipeId = await prisma.aIPApenado.findUnique({
      where: { sipeId: targetSipeId }
    })

    if (existenteComSipeId && existenteComSipeId.id !== id) {
      return NextResponse.json(
        {
          success: false,
          message: `Já existe um cadastro AIP (${existenteComSipeId.nome}) vinculado ao SIPE ID #${targetSipeId}`
        },
        { status: 409 }
      )
    }

    // 4. Atualizar o cadastro na AIP unificando os dados do SIPE sem apagar inteligência
    const apenadoAtualizado = await prisma.aIPApenado.update({
      where: { id },
      data: {
        sipeApenadoId: targetSipeId,
        sipeId: targetSipeId,
        origemRegistro: 'SIPE',

        // Copia dados oficiais do SIPE
        nome: sipeApenado.nome || aipApenado.nome,
        cpf: sipeApenado.cpf || aipApenado.cpf,
        rg: sipeApenado.rg || aipApenado.rg,
        rji: sipeApenado.rji || aipApenado.rji,
        dataNascimento: sipeApenado.dataNascimento || aipApenado.dataNascimento,
        sexo: sipeApenado.sexo || aipApenado.sexo,
        etnia: sipeApenado.etnia || aipApenado.etnia,
        nomeMae: sipeApenado.nomeMae || aipApenado.nomeMae,
        nomePai: sipeApenado.nomePai || aipApenado.nomePai,

        // Dados prisionais do SIPE
        unidade: sipeApenado.unidade || aipApenado.unidade,
        cela: sipeApenado.cela || aipApenado.cela,
        regime: sipeApenado.regime || aipApenado.regime,
        situacao: sipeApenado.situacao || aipApenado.situacao,
        dataEntrada: sipeApenado.dataEntrada || aipApenado.dataEntrada,
        tempoPena: sipeApenado.tempoPena || aipApenado.tempoPena,

        // Preserva a foto se o registro manual já possuía uma
        photoPath: sipeApenado.photoPath || aipApenado.photoPath,

        // Preserva inteligência intacta (vulgo, facaoRealNome, notasInteligencia)
        vulgo: aipApenado.vulgo || sipeApenado.nomeOutro || null,

        atualizadoPor,
        ultimaSincAt: new Date()
      }
    })

    console.log(`[AIP LINK SIPE] ✅ Cadastro AIP #${id} (${aipApenado.nome}) vinculado com sucesso ao SIPE ID #${targetSipeId}`)

    return NextResponse.json({
      success: true,
      apenado: apenadoAtualizado,
      message: `Cadastro vinculado com sucesso ao SIPE ID #${targetSipeId}`
    })
  } catch (error: any) {
    console.error('[AIP LINK SIPE] ❌ Erro ao vincular cadastro ao SIPE:', error)
    return NextResponse.json(
      { success: false, message: `Erro ao vincular cadastro ao SIPE: ${error?.message || error}` },
      { status: 500 }
    )
  }
}
