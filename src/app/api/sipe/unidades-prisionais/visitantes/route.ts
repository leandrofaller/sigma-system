import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { containsNormalized } from '@/lib/search'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const q = (searchParams.get('search') || searchParams.get('q') || '').trim()

  // Buscar todos os registros da tabela sipe_apenados_unidades_prisionais
  const apenados = await prisma.sipeApenadoUnidadePrisional.findMany()

  // Extrair e formatar visitantes
  const result: any[] = []

  for (const ap of apenados) {
    const vists = Array.isArray(ap.visitantes) ? (ap.visitantes as any[]) : []

    for (const v of vists) {
      if (!v || !v.id) continue

      result.push({
        id: `${ap.id}-${v.id}`,
        visitanteId: v.id,
        nomeVisitante: v.nome,
        cpfVisitante: v.cpf,
        parentescoVisitante: v.parentesco,
        ativoVisitante: v.ativo,
        photoPath: v.photoPath,
        descricao: null,
        apenado: {
          id: ap.id,
          nome: ap.nome,
          photoPath: ap.photoPath,
        },
      })
    }
  }

  // Filtrar
  let filtered = result
  if (q) {
    filtered = result.filter(
      v =>
        containsNormalized(v.nomeVisitante, q) ||
        containsNormalized(v.cpfVisitante, q)
    )
  }

  // Ordenar alfabeticamente
  filtered.sort((a, b) => (a.nomeVisitante || '').localeCompare(b.nomeVisitante || ''))

  const total = filtered.length
  const startIndex = (page - 1) * limit
  const paginated = filtered.slice(startIndex, startIndex + limit)

  return NextResponse.json({
    visitantes: paginated,
    total,
    pages: Math.ceil(total / limit),
    currentPage: page
  })
}
