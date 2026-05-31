import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const where = {
      sexo: { not: null }
    }

    // Executa as consultas no banco de dados de forma paralela
    const [
      totalApenados,
      statsUnidade,
      statsRegime,
      statsSexo,
      totalMonitorados,
      unidadesConfig
    ] = await Promise.all([
      prisma.sipeApenadoImportado.count({ where }),
      prisma.sipeApenadoImportado.groupBy({
        by: ['unidade'],
        where,
        _count: { id: true }
      }),
      prisma.sipeApenadoImportado.groupBy({
        by: ['regime'],
        where,
        _count: { id: true }
      }),
      prisma.sipeApenadoImportado.groupBy({
        by: ['sexo'],
        where,
        _count: { id: true }
      }),
      prisma.sipeApenadoImportado.count({
        where: {
          ...where,
          monitorado: true
        }
      }),
      prisma.systemConfig.findUnique({
        where: { key: 'sipe_unidades' }
      }).catch(() => null)
    ])

    // Processamento dos dados de unidades
    const unidadesData = statsUnidade
      .map(item => ({
        nome: item.unidade || 'Não Informada',
        quantidade: item._count.id
      }))
      .sort((a, b) => b.quantidade - a.quantidade)

    // Processamento de regimes
    const regimesData = statsRegime
      .map(item => ({
        nome: item.regime || 'Não Informado',
        quantidade: item._count.id
      }))
      .sort((a, b) => b.quantidade - a.quantidade)

    // Processamento de sexo
    const sexosData = statsSexo
      .map(item => ({
        nome: item.sexo || 'Não Informado',
        quantidade: item._count.id
      }))
      .sort((a, b) => b.quantidade - a.quantidade)

    // Determina o total de unidades cadastradas
    let totalUnidadesCadastradas = 0
    if (unidadesConfig && Array.isArray(unidadesConfig.value)) {
      totalUnidadesCadastradas = unidadesConfig.value.length
    } else {
      totalUnidadesCadastradas = statsUnidade.filter(item => item.unidade).length
    }

    return NextResponse.json({
      totalApenados,
      totalMonitorados,
      totalUnidadesCadastradas,
      unidades: unidadesData,
      regimes: regimesData,
      sexos: sexosData
    })
  } catch (error) {
    console.error('Erro ao gerar estatísticas das unidades:', error)
    return NextResponse.json(
      { error: 'Erro interno ao carregar estatísticas' },
      { status: 500 }
    )
  }
}
