import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Função auxiliar para garantir o registro do apenado no AIP
async function getOrCreateAipApenado(sipeId: number, authorName: string) {
  // 1. Verificar se já existe em AIP
  const existe = await prisma.aIPApenado.findUnique({
    where: { sipeId }
  })
  if (existe) return existe

  // 2. Buscar no SIPE
  const sipeApenado = await prisma.sipeApenadoImportado.findUnique({
    where: { sipeId },
    include: {
      faccao: true,
      vinculosVisitante: {
        include: { visitante: true }
      }
    }
  })

  if (!sipeApenado) return null

  // 3. Criar em AIP copiando todos os dados
  const novo = await prisma.aIPApenado.create({
    data: {
      sipeApenadoId: sipeApenado.sipeId,
      sipeId: sipeApenado.sipeId,
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
      logradouro: sipeApenado.logradouro,
      numero: sipeApenado.numero,
      complemento: sipeApenado.complemento,
      bairro: sipeApenado.bairro,
      cidade: sipeApenado.cidade,
      uf: sipeApenado.uf,
      cep: sipeApenado.cep,
      photoPath: sipeApenado.photoPath,
      ultimaSincAt: new Date(),
      cadastradoPor: authorName
    }
  })

  // Copiar visitantes para AIPFotoVisitante
  if (sipeApenado.vinculosVisitante && sipeApenado.vinculosVisitante.length > 0) {
    await Promise.all(
      sipeApenado.vinculosVisitante.map(async (v) => {
        if (v.visitante) {
          await prisma.aIPFotoVisitante.create({
            data: {
              apenadoId: novo.id,
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

  return novo
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'OPERATOR' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const apenadoId = searchParams.get('apenadoId')
  const sipeIdParam = searchParams.get('sipeId')

  let targetApenadoId = apenadoId
  let aipAp = null

  try {
    if (sipeIdParam) {
      const sipeId = parseInt(sipeIdParam)
      aipAp = await prisma.aIPApenado.findUnique({
        where: { sipeId }
      })
      if (!aipAp) {
        // Se não está cadastrado em AIP, não possui vínculos ainda
        return NextResponse.json({ vinculos: [], apenadoAip: null })
      }
      targetApenadoId = aipAp.id
    } else if (apenadoId) {
      aipAp = await prisma.aIPApenado.findUnique({
        where: { id: apenadoId }
      })
    }

    if (targetApenadoId) {
      // Buscar todos os vínculos onde o apenado em questão está envolvido
      const vinculos = await prisma.aIPVinculo.findMany({
        where: {
          OR: [
            { apenadoId: targetApenadoId },
            { vinculadoComId: targetApenadoId }
          ]
        },
        include: {
          apenado: true // Inclui o apenado da ponta principal
        }
      })

      // Resolver o "outro" apenado para cada vínculo
      const vinculosFormatados = await Promise.all(vinculos.map(async (v) => {
        const isPrincipal = v.apenadoId === targetApenadoId
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

      // Buscar advogados vinculados via SIPE (separado dos AIPVinculos)
      let advogados: any[] = []
      if (aipAp?.sipeId) {
        const sipeAp = await prisma.sipeApenadoImportado.findUnique({
          where: { sipeId: aipAp.sipeId },
          include: {
            vinculosAdvogado: {
              where: { ativo: true },
              include: { advogado: true }
            }
          }
        })
        if (sipeAp?.vinculosAdvogado) {
          advogados = sipeAp.vinculosAdvogado.map(v => ({
            id: v.id,
            advogadoId: v.advogado.id,
            sipeId: v.advogado.sipeId,
            nome: v.advogado.nome,
            oab: v.advogado.oab,
            cpf: v.advogado.cpf,
            telefone: v.advogado.telefone,
            photoPath: v.advogado.photoPath,
            ativo: v.ativo
          }))
        }
      }

      return NextResponse.json({ vinculos: vinculosFormatados, apenadoAip: aipAp, advogados })
    } else {
      // Retorna todos os vínculos se não for passado apenadoId/sipeId
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
    const { apenadoSipeId, vinculadoComSipeId, tipo, forca, notaVinculo } = body

    if (!apenadoSipeId || !vinculadoComSipeId || !tipo) {
      return NextResponse.json({ error: 'Campos apenadoSipeId, vinculadoComSipeId e tipo são obrigatórios' }, { status: 400 })
    }

    const sId1 = parseInt(apenadoSipeId)
    const sId2 = parseInt(vinculadoComSipeId)

    if (sId1 === sId2) {
      return NextResponse.json({ error: 'Não é possível criar um vínculo de um apenado com ele mesmo' }, { status: 400 })
    }

    const userName = session.user.name || 'Agente'

    // Garantir que ambos existem no AIP (registra se necessário)
    const ap1 = await getOrCreateAipApenado(sId1, userName)
    const ap2 = await getOrCreateAipApenado(sId2, userName)

    if (!ap1 || !ap2) {
      return NextResponse.json({ error: 'Um ou ambos os apenados não foram encontrados no banco de dados' }, { status: 404 })
    }

    const apenadoId = ap1.id
    const vinculadoComId = ap2.id

    // Prevenir duplicidade de vínculo
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
