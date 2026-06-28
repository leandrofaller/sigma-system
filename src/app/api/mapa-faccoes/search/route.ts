import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unaccentParam } from '@/lib/search'
import { faccaoCor, faccaoDisplay } from '@/lib/mapa-faccoes'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const q = unaccentParam(searchParams.get('q'))
  const sipeIdParam = searchParams.get('sipeId')
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)))

  try {
    if (sipeIdParam) {
      const sipeId = parseInt(sipeIdParam, 10)
      if (!isNaN(sipeId)) {
        const [aip, sipe] = await Promise.all([
          prisma.aIPApenado.findUnique({ where: { sipeId } }),
          prisma.sipeApenadoImportado.findUnique({
            where: { sipeId },
            include: { faccao: true },
          }),
        ])

        const results = []
        if (aip) {
          results.push({
            source: 'AIP' as const,
            aipApenadoId: aip.id,
            sipeId: aip.sipeId,
            nome: aip.nome,
            unidade: aip.unidade,
            faccao: faccaoDisplay(aip),
            faccaoCor: faccaoCor(faccaoDisplay(aip)),
            emAip: true,
          })
        } else if (sipe) {
          results.push({
            source: 'SIPE' as const,
            aipApenadoId: null,
            sipeId: sipe.sipeId,
            nome: sipe.nome,
            unidade: sipe.unidade,
            faccao: sipe.faccao?.nome || 'Não identificado',
            faccaoCor: faccaoCor(sipe.faccao?.nome || 'Não identificado'),
            emAip: false,
          })
        }
        return NextResponse.json({ results })
      }
    }

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] })
    }

    const pattern = `%${q}%`

    const [aipRows, sipeRows] = await Promise.all([
      prisma.$queryRawUnsafe<
        { id: string; sipeId: number; nome: string; unidade: string | null; faccao: string | null; facaoRealNome: string | null }[]
      >(
        `SELECT id, "sipeId", nome, unidade, faccao, "facaoRealNome"
         FROM aip_apenados
         WHERE immutable_unaccent(nome) ILIKE immutable_unaccent($1)
            OR CAST("sipeId" AS TEXT) ILIKE $1
            OR COALESCE(cpf,'') ILIKE $1
         ORDER BY nome ASC
         LIMIT $2`,
        pattern,
        limit
      ),
      prisma.$queryRawUnsafe<
        { sipeId: number; nome: string; unidade: string | null; faccaoId: string | null }[]
      >(
        `SELECT s."sipeId", s.nome, s.unidade, s."faccaoId"
         FROM sipe_apenados_importados s
         WHERE immutable_unaccent(s.nome) ILIKE immutable_unaccent($1)
            OR CAST(s."sipeId" AS TEXT) ILIKE $1
            OR COALESCE(s.cpf,'') ILIKE $1
         ORDER BY s.nome ASC
         LIMIT $2`,
        pattern,
        limit
      ),
    ])

    const aipSipeIds = new Set(aipRows.map((r) => r.sipeId))
    const faccaoIds = sipeRows.map((r) => r.faccaoId).filter(Boolean) as string[]
    const faccoes =
      faccaoIds.length > 0
        ? await prisma.sipeFaccao.findMany({ where: { id: { in: faccaoIds } } })
        : []
    const faccaoMap = Object.fromEntries(faccoes.map((f) => [f.id, f.nome]))

    const results = [
      ...aipRows.map((r) => ({
        source: 'AIP' as const,
        aipApenadoId: r.id,
        sipeId: r.sipeId,
        nome: r.nome,
        unidade: r.unidade,
        faccao: faccaoDisplay(r),
        faccaoCor: faccaoCor(faccaoDisplay(r)),
        emAip: true,
      })),
      ...sipeRows
        .filter((r) => !aipSipeIds.has(r.sipeId))
        .map((r) => {
          const fn = r.faccaoId ? faccaoMap[r.faccaoId] || 'Não identificado' : 'Não identificado'
          return {
            source: 'SIPE' as const,
            aipApenadoId: null,
            sipeId: r.sipeId,
            nome: r.nome,
            unidade: r.unidade,
            faccao: fn,
            faccaoCor: faccaoCor(fn),
            emAip: false,
          }
        }),
    ].slice(0, limit)

    return NextResponse.json({ results })
  } catch (e) {
    console.error('[mapa-faccoes/search]', e)
    return NextResponse.json({ error: 'Erro na busca' }, { status: 500 })
  }
}