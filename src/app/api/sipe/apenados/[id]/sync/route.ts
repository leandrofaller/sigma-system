import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { scrapeApenadoFichaFast, resolveUnidadeIdByNome } from '@/lib/sipe-scraper'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  const { id } = await params

  try {
    const dbApenado = await prisma.sipeApenadoImportado.findUnique({
      where: { id }
    })

    if (!dbApenado) {
      return NextResponse.json({ error: 'Apenado não encontrado no banco local' }, { status: 404 })
    }

    const sipeId = dbApenado.sipeId
    const apenadoUnidadeNome = dbApenado.unidade

    // Configurar o engine e a unidade ativa temporariamente no escopo global para a raspagem síncrona
    const apenadoUnidadeId = apenadoUnidadeNome ? await resolveUnidadeIdByNome(apenadoUnidadeNome) : '3'
    globalThis.__sipeCurrentEngine = 'python-sdk'
    globalThis.__sipeFallbackUnidade = apenadoUnidadeId || '3'
    globalThis.__sipeStopFlag = false

    console.log(`[SYNC INDIVIDUAL] 🔄 Iniciando raspagem individual para o apenado #${sipeId} (${dbApenado.nome})...`)

    // Roda a raspagem de ficha acelerada (fast) síncronamente.
    // Usamos useSearch = true para que o scraper localize o apenado no index e resolva sua unidade dinamicamente
    await scrapeApenadoFichaFast(sipeId, apenadoUnidadeNome, true)

    // Buscar o apenado novamente com todas as relações para retornar os dados completos atualizados
    const updated = await prisma.sipeApenadoImportado.findUnique({
      where: { id },
      include: {
        faccao: true,
        alcunhas: true,
        processos: true,
        vinculosAdvogado: {
          include: {
            advogado: true
          }
        },
        vinculosVisitante: {
          include: {
            visitante: true
          }
        },
        historicos: true,
        fotosComplementares: true
      }
    })

    console.log(`[SYNC INDIVIDUAL] ✅ Sincronização concluída com sucesso para #${sipeId}.`)

    return NextResponse.json({ success: true, apenado: updated })
  } catch (err: any) {
    console.error(`[SYNC INDIVIDUAL] ❌ Erro ao sincronizar apenado ${id}:`, err)
    return NextResponse.json(
      { error: `Erro na sincronização individual: ${err?.message || err}` },
      { status: 500 }
    )
  }
}
