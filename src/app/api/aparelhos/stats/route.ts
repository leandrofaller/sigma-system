import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { containsNormalizedText, normalizeSearchText } from '@/lib/search'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = normalizeSearchText(searchParams.get('search'))
  const unidade = normalizeSearchText(searchParams.get('unidade'))
  const municipio = normalizeSearchText(searchParams.get('municipio'))
  const marca = normalizeSearchText(searchParams.get('marca'))
  const dataInicio = searchParams.get('dataInicio') || ''
  const dataFim = searchParams.get('dataFim') || ''

  const where: any = {}
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
    const filteredItems = (await prisma.aparelhoApreendido.findMany({
      where,
      orderBy: { dataArrecadacao: 'asc' }
    })).filter((item) => {
      if (
        search &&
        !containsNormalizedText(item.responsavel, search) &&
        !containsNormalizedText(item.celaPavilhao, search) &&
        !containsNormalizedText(item.processoSei, search) &&
        !containsNormalizedText(item.marca, search) &&
        !containsNormalizedText(item.municipio, search) &&
        !containsNormalizedText(item.unidadePrisional, search) &&
        !containsNormalizedText(item.unidadeExterna, search) &&
        !containsNormalizedText(item.localExterno, search)
      ) {
        return false
      }

      if (unidade && !containsNormalizedText(item.unidadePrisional, unidade)) {
        return false
      }
      if (municipio && !containsNormalizedText(item.municipio, municipio)) {
        return false
      }
      if (marca && !containsNormalizedText(item.marca, marca)) {
        return false
      }

      return true
    })

    const total = filteredItems.length

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

    const countBy = (values: string[]) =>
      Object.entries(values.reduce<Record<string, number>>((acc, value) => {
        acc[value] = (acc[value] || 0) + 1
        return acc
      }, {})).sort((a, b) => b[1] - a[1])

    const unidadesStats = countBy(filteredItems.map((item) => item.unidadePrisional?.trim() || 'Nao Informada')).slice(0, 10)
    const marcasStats = countBy(filteredItems.map((item) => item.marca?.trim() || 'Outras/NI')).slice(0, 10)
    const municipiosStats = countBy(filteredItems.map((item) => item.municipio?.trim() || 'Nao Informado')).slice(0, 10)

    const chipMap: { [key: string]: number } = {}
    let semChipCount = 0

    filteredItems.forEach(item => {
      const chipVal = item.chip ? item.chip.trim().toUpperCase() : ''
      if (!chipVal || chipVal === '' || chipVal === 'NAO' || chipVal === 'N/I' || chipVal === 'SEM CHIP') {
        semChipCount += 1
      } else {
        let operadora = item.chip!.trim()
        const upper = operadora.toUpperCase()
        if (upper.includes('CLARO')) operadora = 'Claro'
        else if (upper.includes('VIVO')) operadora = 'Vivo'
        else if (upper.includes('TIM')) operadora = 'Tim'
        else if (upper.includes('OI')) operadora = 'Oi'

        chipMap[operadora] = (chipMap[operadora] || 0) + 1
      }
    })

    const chipsFormatted = Object.entries(chipMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    if (semChipCount > 0) {
      chipsFormatted.push({ name: 'Sem Chip / NI', count: semChipCount })
    }

    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    const timelineMap: { [key: string]: { count: number, order: number } } = {}

    filteredItems.forEach(item => {
      if (!item.dataArrecadacao) return
      const date = new Date(item.dataArrecadacao)
      const year = date.getUTCFullYear()
      const monthIdx = date.getUTCMonth()
      const key = `${year}-${(monthIdx + 1).toString().padStart(2, '0')}`

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

    const smartwatchesCount = filteredItems.filter((item) => item.smartwatch && item.smartwatch.trim() !== '').length
    const chipCount = filteredItems.filter((item) => item.chip && item.chip.trim() !== '').length
    const internoCount = filteredItems.filter((item) => item.celaPavilhao && item.celaPavilhao.trim() !== '').length
    const externoCount = filteredItems.filter(
      (item) =>
        (item.unidadeExterna && item.unidadeExterna.trim() !== '') ||
        (item.localExterno && item.localExterno.trim() !== '')
    ).length
    const celularesCount = filteredItems.filter((item) => item.marca && item.marca.trim() !== '').length
    const chipsAvulsosCount = filteredItems.filter(
      (item) => item.chip && item.chip.trim() !== '' && (!item.marca || item.marca.trim() === '')
    ).length

    return NextResponse.json({
      total,
      celularesCount,
      chipsAvulsosCount,
      unidades: unidadesStats.map(([name, count]) => ({ name, count })),
      marcas: marcasStats.map(([name, count]) => ({ name, count })),
      municipios: municipiosStats.map(([name, count]) => ({ name, count })),
      chips: chipsFormatted,
      timeline: timelineFormatted,
      smartwatchesCount,
      chipCount,
      locais: {
        interno: internoCount,
        externo: externoCount,
        naoConsta: Math.max(0, total - (internoCount + externoCount))
      }
    })

  } catch (error: any) {
    console.error('Error calculating device statistics:', error)
    return NextResponse.json({ error: 'Erro ao calcular estatisticas' }, { status: 500 })
  }
}
