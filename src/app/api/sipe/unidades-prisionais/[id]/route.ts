import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  
  // Apenas Superadmin pode acessar os dados isolados de unidades prisionais
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  const { id } = await params

  const dbApenado = await prisma.sipeApenadoUnidadePrisional.findUnique({
    where: { id },
    include: {
      faccao: true,
    },
  })

  if (!dbApenado) {
    return NextResponse.json({ error: 'Apenado não encontrado' }, { status: 404 })
  }

  const advs = Array.isArray(dbApenado.advogados) ? dbApenado.advogados : []
  const vists = Array.isArray(dbApenado.visitantes) ? dbApenado.visitantes : []
  const alcunhas = Array.isArray(dbApenado.alcunhas) ? dbApenado.alcunhas : []
  const processos = Array.isArray(dbApenado.processos) ? dbApenado.processos : []
  const historicos = Array.isArray(dbApenado.historicos) ? dbApenado.historicos : []
  const fotosComplementares = Array.isArray(dbApenado.fotosComplementares) ? dbApenado.fotosComplementares : []

  const apenado = {
    ...dbApenado,
    alcunhas,
    processos,
    historicos,
    fotosComplementares,
    vinculosAdvogado: advs.map((adv: any) => ({
      advogado: {
        id: adv.id,
        nome: adv.nome,
        oab: adv.oab || null
      }
    })),
    vinculosVisitante: vists.map((v: any) => ({
      visitante: {
        id: v.id,
        nome: v.nome,
        cpf: v.cpf || null,
        parentesco: v.parentesco || null,
        photoPath: v.photoPath || null
      },
      ativo: v.ativo !== false
    }))
  }

  return NextResponse.json(apenado)
}
