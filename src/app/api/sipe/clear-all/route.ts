import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })

  // Deleção em ordem respeitando FK constraints:
  // 1. Tabelas de junção / dependentes (referenciam SipeApenadoImportado e SipeAdvogado/SipeVisitante)
  // 2. Tabela principal de apenados
  // 3. Tabelas independentes (advogados, visitantes, facções)
  // 4. Histórico de jobs de sincronização
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
  ])

  await createAuditLog({
    userId: (session.user as any).id,
    action: AUDIT_ACTIONS.DELETE_RELINT,
    entity: 'SipeClearAll',
    entityId: 'all',
    details: { apenados: apenados.count, advogados: advogados.count, visitantes: visitantes.count, faccoes: faccoes.count, jobs: jobs.count },
    request: req,
  })

  return NextResponse.json({
    success: true,
    deletados: {
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
    },
  })
}
