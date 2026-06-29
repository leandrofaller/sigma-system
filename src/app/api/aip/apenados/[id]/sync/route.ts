import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { scrapeApenadoFichaFast, resolveUnidadeIdByNome } from '@/lib/sipe-scraper'
import { syncMapaFromAipAsync } from '@/lib/mapa-faccoes-aip-sync'

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
    const aipApenado = await prisma.aIPApenado.findUnique({
      where: { id }
    })

    if (!aipApenado) {
      return NextResponse.json({ error: 'Apenado não encontrado em AIP' }, { status: 404 })
    }

    const sipeId = aipApenado.sipeId
    const apenadoUnidadeNome = aipApenado.unidade

    // Configurar o engine e a unidade ativa temporariamente no escopo global para a raspagem síncrona
    const apenadoUnidadeId = apenadoUnidadeNome ? await resolveUnidadeIdByNome(apenadoUnidadeNome) : '3'
    globalThis.__sipeCurrentEngine = 'python-sdk'
    globalThis.__sipeFallbackUnidade = apenadoUnidadeId || '3'
    globalThis.__sipeStopFlag = false

    console.log(`[SYNC AIP INDIVIDUAL] 🔄 Iniciando raspagem individual em AIP para o apenado #${sipeId} (${aipApenado.nome})...`)

    // Roda a raspagem de ficha acelerada (fast) síncronamente.
    await scrapeApenadoFichaFast(sipeId, apenadoUnidadeNome, true)

    // Buscar o apenado AIP atualizado com todas as relações e dados copiados do SIPE
    const updated = await prisma.aIPApenado.findUnique({
      where: { id },
      include: {
        fotoVisitantes: true,
        sipeApenado: {
          include: {
            vinculosAdvogado: {
              include: {
                advogado: true
              }
            }
          }
        }
      }
    })

    if (!updated) {
      return NextResponse.json({ error: 'Erro ao recarregar apenado AIP atualizado' }, { status: 500 })
    }

    // Verificar se o apenado possui vínculos para atribuir o booleano 'temVinculos'
    const vinculos = await prisma.aIPVinculo.findMany({
      where: {
        OR: [
          { apenadoId: id },
          { vinculadoComId: id }
        ]
      }
    })
    const temVinculos = vinculos.length > 0

    console.log(`[SYNC AIP INDIVIDUAL] ✅ Sincronização em AIP concluída com sucesso para #${sipeId}.`)

    syncMapaFromAipAsync(id, (session.user as { id: string }).id)

    return NextResponse.json({
      success: true,
      apenado: {
        ...updated,
        temVinculos
      }
    })
  } catch (err: any) {
    console.error(`[SYNC AIP INDIVIDUAL] ❌ Erro ao sincronizar apenado AIP ${id}:`, err)
    return NextResponse.json(
      { error: `Erro na sincronização individual AIP: ${err?.message || err}` },
      { status: 500 }
    )
  }
}
