import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  // Get distinct unit names from SipeApenadoUnidadePrisional
  const statsUnidade = await prisma.sipeApenadoUnidadePrisional.groupBy({
    by: ['unidade'],
    where: {
      unidade: { not: null }
    }
  })

  // Format as Array<{ id: string; nome: string }>
  const unidades = statsUnidade
    .map((item, index) => ({
      id: String(index + 1),
      nome: item.unidade as string
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome))

  return NextResponse.json({ unidades })
}
