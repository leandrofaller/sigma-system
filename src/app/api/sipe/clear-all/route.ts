import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'todos'

  let deletados: any = {}

  if (type === 'apenados') {
    // Deleção em ordem para apenados (tabelas dependentes de SipeApenadoImportado primeiro)
    // IMPORTANTE: AIP records NÃO são deletados, apenas desincronizados
    const [
      vinculosVisitante,
      vinculosAdvogado,
      processos,
      alcunhas,
      historicos,
      documentos,
      apenados,
      desincronizadosAIP,
    ] = await prisma.$transaction([
      prisma.sipeVinculoVisitante.deleteMany(),
      prisma.sipeVinculoAdvogado.deleteMany(),
      prisma.sipeProcesso.deleteMany(),
      prisma.sipeAlcunha.deleteMany(),
      prisma.sipeHistorico.deleteMany(),
      prisma.sipeDocumento.deleteMany(),
      prisma.sipeApenadoImportado.deleteMany(),
      // Marcar AIP records como desincronizados (mas não deletar)
      prisma.aIPApenado.updateMany({
        where: { ultimaSincAt: { not: null } },
        data: { ultimaSincAt: null }
      })
    ])

    deletados = {
      apenados: apenados.count,
      processos: processos.count,
      alcunhas: alcunhas.count,
      historicos: historicos.count,
      documentos: documentos.count,
      vinculosAdvogado: vinculosAdvogado.count,
      vinculosVisitante: vinculosVisitante.count,
      aipDesincronizados: desincronizadosAIP.count,
    }
  } else if (type === 'advogados') {
    // Deleção de advogados e seus respectivos vínculos
    const [vinculosAdvogado, advogados] = await prisma.$transaction([
      prisma.sipeVinculoAdvogado.deleteMany(),
      prisma.sipeAdvogado.deleteMany(),
    ])

    deletados = {
      advogados: advogados.count,
      vinculosAdvogado: vinculosAdvogado.count,
    }
  } else if (type === 'faccoes') {
    // Deleção de facções (Prisma/DB fará onDelete SetNull nos apenados vinculados)
    const [faccoes] = await prisma.$transaction([
      prisma.sipeFaccao.deleteMany(),
    ])

    deletados = {
      faccoes: faccoes.count,
    }
  } else if (type === 'visitantes') {
    // Deleção de visitantes e seus respectivos vínculos
    const [vinculosVisitante, visitantes] = await prisma.$transaction([
      prisma.sipeVinculoVisitante.deleteMany(),
      prisma.sipeVisitante.deleteMany(),
    ])

    deletados = {
      visitantes: visitantes.count,
      vinculosVisitante: vinculosVisitante.count,
    }
  } else {
    // Comportamento original: deleta tudo (mas AIP é protegido)
    const [
      vinculosVisitante,
      vinculosAdvogado,
      processos,
      alcunhas,
      historicos,
      documentos,
      apenados,
      advogados,
      visitantes,
      faccoes,
      jobs,
      desincronizadosAIP,
    ] = await prisma.$transaction([
      prisma.sipeVinculoVisitante.deleteMany(),
      prisma.sipeVinculoAdvogado.deleteMany(),
      prisma.sipeProcesso.deleteMany(),
      prisma.sipeAlcunha.deleteMany(),
      prisma.sipeHistorico.deleteMany(),
      prisma.sipeDocumento.deleteMany(),
      prisma.sipeApenadoImportado.deleteMany(),
      prisma.sipeAdvogado.deleteMany(),
      prisma.sipeVisitante.deleteMany(),
      prisma.sipeFaccao.deleteMany(),
      prisma.sipeSyncJob.deleteMany(),
      // Marcar AIP records como desincronizados (mas não deletar)
      prisma.aIPApenado.updateMany({
        where: { ultimaSincAt: { not: null } },
        data: { ultimaSincAt: null }
      })
    ])

    deletados = {
      apenados: apenados.count,
      advogados: advogados.count,
      visitantes: visitantes.count,
      faccoes: faccoes.count,
      processos: processos.count,
      alcunhas: alcunhas.count,
      historicos: historicos.count,
      documentos: documentos.count,
      vinculosAdvogado: vinculosAdvogado.count,
      vinculosVisitante: vinculosVisitante.count,
      jobs: jobs.count,
      aipDesincronizados: desincronizadosAIP.count,
    }
  }

  await createAuditLog({
    userId: (session.user as any).id,
    action: AUDIT_ACTIONS.DELETE_RELINT,
    entity: 'SipeClearAll',
    entityId: type,
    details: { type, deletados },
    request: req,
  })

  return NextResponse.json({
    success: true,
    type,
    deletados,
  })
}
