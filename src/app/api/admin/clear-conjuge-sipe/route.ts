import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// DELETE /api/admin/clear-conjuge-sipe?sipeId=64403
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  const sipeId = parseInt(req.nextUrl.searchParams.get('sipeId') || '')
  if (isNaN(sipeId)) return NextResponse.json({ error: 'sipeId inválido' }, { status: 400 })

  const sipe = await prisma.sipeApenadoImportado.updateMany({
    where: { sipeId },
    data: { nomeConjuge: null },
  })

  const aip = await prisma.aIPApenado.updateMany({
    where: { sipeId },
    data: { nomeConjuge: null },
  })

  return NextResponse.json({
    success: true,
    sipeUpdated: sipe.count,
    aipUpdated: aip.count,
    message: `nomeConjuge limpo para sipeId=${sipeId}`,
  })
}
