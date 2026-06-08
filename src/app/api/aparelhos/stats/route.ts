import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const unidade = searchParams.get('unidade') || ''
  const municipio = searchParams.get('municipio') || ''
  const marca = searchParams.get('marca') || ''
  const dataInicio = searchParams.get('dataInicio') || ''
  const dataFim = searchParams.get('dataFim') || ''

  // Construindo a cláusula where idêntica à listagem
  const where: any = {}

  if (search) {
    where.OR = [
      { responsavel: { contains: search, mode: 'insensitive' } },
      { celaPavilhao: { contains: search, mode: 'insensitive' } },
      { processoSei: { contains: search, mode: 'insensitive' } },
      { marca: { contains: search, mode: 'insensitive' } },
      { municipio: { contains: search, mode: 'insensitive' } },
      { unidadePrisional: { contains: search, mode: 'insensitive' } },
      { unidadeExterna: { contains: search, mode: 'insensitive' } },
      { localExterno: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (unidade) {
    where.unidadePrisional = unidade
  }
  if (municipio) {
    where.municipio = municipio
  }
  if (marca) {
    where.marca = { contains: marca, mode: 'insensitive' }
  }

  if (dataInicio || dataFim) {
    where.dataArrecadacao = {}
    if (dataInicio) {
      where.dataArrecadacao.gte = new Date(dataInicio)
    }
    if (dataFim) {
      const dateFimObj = new Date(dataFim)
      dateFimObj.setHours(23, 59, 59, 999)
      where.dataArrecadacao.lte = dateFimObj
    }
  }

  try {
    // 1. Total Geral de Dispositivos com os filtros aplicados
    const total = await prisma.aparelhoApreendido.count({ where })

    if (total === 0) {
      return NextResponse.json({
        total: 0,
        unidades: [],
        marcas: [],
        municipios: [],
        chips: [],
        timeline: [],
        smartwatchesCount: 0,
        chipCount: 0,
        locais: { interno: 0, externo: 0, naoConsta: 0 }
      })
    }

    // Executando agregações em paralelo
    const [
      unidadesStats,
      marcasStats,
      municipiosStats,
      chipsStats,
      smartwatchesCount,
      chipCount,
      internoCount,
      externoCount,
      allDates
    ] = await Promise.all([
      // 2. Top 10 Unidades Prisionais
      prisma.aparelhoApreendido.groupBy({
        by: ['unidadePrisional'],
        where: { ...where, unidadePrisional: { not: '' } },
        _count: { unidadePrisional: true },
        orderBy: { _count: { unidadePrisional: 'desc' } },
        take: 10,
      }),
      // 3. Top 10 Marcas
      prisma.aparelhoApreendido.groupBy({
        by: ['marca'],
        where: { ...where, marca: { notIn: [null, ''] } },
        _count: { marca: true },
        orderBy: { _count: { marca: 'desc' } },
        take: 10,
      }),
      // 4. Top 10 Municípios
      prisma.aparelhoApreendido.groupBy({
        by: ['municipio'],
        where: { ...where, municipio: { not: '' } },
        _count: { municipio: true },
        orderBy: { _count: { municipio: 'desc' } },
        take: 10,
      }),
      // 5. CHIPs por Operadora
      prisma.aparelhoApreendido.groupBy({
        by: ['chip'],
        where,
        _count: { chip: true },
        orderBy: { _count: { chip: 'desc' } },
      }),
      // 6. Contagem de Smartwatches
      prisma.aparelhoApreendido.count({
        where: {
          ...where,
          smartwatch: { notIn: [null, ''] }
        }
      }),
      // 7. Contagem de Aparelhos com CHIP
      prisma.aparelhoApreendido.count({
        where: {
          ...where,
          chip: { notIn: [null, ''] }
        }
      }),
      // 8. Locais: Interno (Cela/Pavilhão)
      prisma.aparelhoApreendido.count({
        where: {
          ...where,
          celaPavilhao: { notIn: [null, ''] }
        }
      }),
      // 9. Locais: Externo (Setor Externo ou Local Externo)
      prisma.aparelhoApreendido.count({
        where: {
          ...where,
          OR: [
            { unidadeExterna: { notIn: [null, ''] } },
            { localExterno: { notIn: [null, ''] } }
          ]
        }
      }),
      // 10. Busca de datas para construir a linha do tempo no Node
      prisma.aparelhoApreendido.findMany({
        select: { dataArrecadacao: true },
        where: {
          ...where,
          dataArrecadacao: { not: null }
        },
        orderBy: { dataArrecadacao: 'asc' }
      })
    ])

    // Processar CHIPs/Operadoras para padronizar
    const chipMap: { [key: string]: number } = {}
    let semChipCount = 0

    chipsStats.forEach(item => {
      const chipVal = item.chip ? item.chip.trim().toUpperCase() : ''
      if (!chipVal || chipVal === '' || chipVal === 'NÃO' || chipVal === 'N/I' || chipVal === 'SEM CHIP') {
        semChipCount += item._count.chip
      } else {
        // Normaliza nomes comuns de operadoras
        let operadora = item.chip!.trim()
        const upper = operadora.toUpperCase()
        if (upper.includes('CLARO')) operadora = 'Claro'
        else if (upper.includes('VIVO')) operadora = 'Vivo'
        else if (upper.includes('TIM')) operadora = 'Tim'
        else if (upper.includes('OI')) operadora = 'Oi'
        
        chipMap[operadora] = (chipMap[operadora] || 0) + item._count.chip
      }
    })

    const chipsFormatted = Object.entries(chipMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    if (semChipCount > 0) {
      chipsFormatted.push({ name: 'Sem Chip / NI', count: semChipCount })
    }

    // Processar timeline por mês/ano (ex: "Jan/24", "Fev/24")
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    const timelineMap: { [key: string]: { count: number, order: number } } = {}

    allDates.forEach(item => {
      if (!item.dataArrecadacao) return
      const date = new Date(item.dataArrecadacao)
      const year = date.getUTCFullYear()
      const monthIdx = date.getUTCMonth()
      
      const label = `${months[monthIdx]}/${year.toString().slice(-2)}`
      const key = `${year}-${(monthIdx + 1).toString().padStart(2, '0')}` // para ordenação correta

      if (!timelineMap[key]) {
        timelineMap[key] = { count: 0, order: year * 12 + monthIdx }
      }
      timelineMap[key].count++
    })

    const timelineFormatted = Object.entries(timelineMap)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, val]) => {
        const parts = key.split('-')
        const y = parts[0]
        const m = parseInt(parts[1], 10) - 1
        return {
          date: `${months[m]}/${y.slice(-2)}`,
          Quantidade: val.count
        }
      })

    // Locais consolidados
    const naoConstaLocais = Math.max(0, total - (internoCount + externoCount))

    return NextResponse.json({
      total,
      unidades: unidadesStats.map(u => ({ name: u.unidadePrisional || 'Não Informada', count: u._count.unidadePrisional })),
      marcas: marcasStats.map(m => ({ name: m.marca || 'Outras/NI', count: m._count.marca })),
      municipios: municipiosStats.map(m => ({ name: m.municipio || 'Não Informado', count: m._count.municipio })),
      chips: chipsFormatted,
      timeline: timelineFormatted,
      smartwatchesCount,
      chipCount,
      locais: {
        interno: internoCount,
        externo: externoCount,
        naoConsta: naoConstaLocais
      }
    })

  } catch (error: any) {
    console.error('Error calculating device statistics:', error)
    return NextResponse.json({ error: 'Erro ao calcular estatísticas' }, { status: 500 })
  }
}
