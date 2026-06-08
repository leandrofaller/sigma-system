import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++ // pula a próxima aspa dupla
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null
  
  const cleanStr = dateStr.trim().replace(/^['"]|['"]$/g, '')
  const upper = cleanStr.toUpperCase()
  if (upper === 'N/I' || upper === 'NÃO CONSTA' || upper === 'S/N' || upper === 'S/I' || upper === 'NÃO REGISTRADO NO SEI' || upper === '') {
    return null
  }

  const dateTimeParts = cleanStr.split(' ')
  const dateParts = dateTimeParts[0].split('/')

  if (dateParts.length !== 3) {
    const t = Date.parse(cleanStr)
    return isNaN(t) ? null : new Date(t)
  }

  const day = parseInt(dateParts[0], 10)
  const month = parseInt(dateParts[1], 10) - 1
  let year = parseInt(dateParts[2], 10)

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null

  if (year < 1000) {
    if (year === 222 || year === 22 || year === 202) {
      year = 2022
    } else if (year === 23 || year === 203) {
      year = 2023
    } else if (year === 24 || year === 204) {
      year = 2024
    } else {
      year = new Date().getFullYear()
    }
  }

  let hours = 0
  let minutes = 0
  let seconds = 0

  if (dateTimeParts[1]) {
    const timeParts = dateTimeParts[1].split(':')
    hours = parseInt(timeParts[0] || '0', 10)
    minutes = parseInt(timeParts[1] || '0', 10)
    seconds = parseInt(timeParts[2] || '0', 10)
  }

  // Cria a data usando Date.UTC para garantir fidedignidade com o fuso UTC e evitar deslocamentos
  const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds))
  return isNaN(date.getTime()) ? null : date
}

async function main() {
  const args = process.argv.slice(2)
  const csvPath = args[0]

  if (!csvPath) {
    console.error('❌ Erro: Por favor, especifique o caminho para o arquivo CSV.')
    console.log('Exemplo: npx tsx scripts/import_aparelhos.ts "c:\\caminho\\para\\planilha.csv"')
    process.exit(1)
  }

  const absolutePath = path.resolve(csvPath)
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Erro: Arquivo não encontrado em "${absolutePath}"`)
    process.exit(1)
  }

  console.log(`🚀 Carregando arquivo CSV de: "${absolutePath}"...\n`)

  try {
    const text = fs.readFileSync(absolutePath, 'utf-8')
    const rawLines = text.split(/\r?\n/)
    const lines = rawLines.filter(line => line.trim() !== '')

    if (lines.length < 2) {
      console.error('❌ Erro: Arquivo CSV vazio ou sem dados.')
      process.exit(1)
    }

    console.log(`📊 Linhas totais detectadas no CSV: ${lines.length - 1}`)

    const registrosParaInserir: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const columns = parseCSVLine(lines[i])
      
      if (columns.length < 6) continue

      const timestampStr = columns[0]
      const responsavel = columns[1]
      const dataArrecadacaoStr = columns[2]
      const dataRecebimentoStr = columns[3]
      const municipio = columns[4]
      const unidadePrisional = columns[5]
      const celaPavilhao = columns[6]
      const unidadeExterna = columns[7]
      const localExterno = columns[8]
      const processoSei = columns[9]
      const marca = columns[10]
      const smartwatch = columns[11]
      const chip = columns[12]

      const timestamp = parseDate(timestampStr) || new Date()
      const dataArrecadacao = parseDate(dataArrecadacaoStr)
      const dataRecebimento = parseDate(dataRecebimentoStr)

      registrosParaInserir.push({
        timestamp,
        responsavel: responsavel || 'Não Informado',
        dataArrecadacao,
        dataRecebimento,
        municipio: municipio || 'Não Informado',
        unidadePrisional: unidadePrisional || 'Não Informado',
        celaPavilhao: celaPavilhao || null,
        unidadeExterna: unidadeExterna || null,
        localExterno: localExterno || null,
        processoSei: processoSei || null,
        marca: marca || null,
        smartwatch: smartwatch || null,
        chip: chip || null,
      })
    }

    console.log(`⚙️  Processados ${registrosParaInserir.length} registros válidos para inserção.`)
    console.log('⚠️  Limpando registros antigos do banco (Overwrite)...')
    await prisma.aparelhoApreendido.deleteMany()
    console.log('✅ Banco limpo.')

    console.log('⏳ Gravando no banco de dados em lotes (lotes de 100)...')
    
    let inseridos = 0
    const batchSize = 100
    
    for (let i = 0; i < registrosParaInserir.length; i += batchSize) {
      const batch = registrosParaInserir.slice(i, i + batchSize)
      await prisma.aparelhoApreendido.createMany({
        data: batch,
      })
      inseridos += batch.length
      const pct = Math.round((inseridos / registrosParaInserir.length) * 100)
      console.log(`  [${inseridos}/${registrosParaInserir.length}] ${pct}% gravado...`)
    }

    console.log(`\n🎉 Sucesso! Total de ${inseridos} aparelhos inseridos no banco de dados.`)

  } catch (error: any) {
    console.error('❌ Ocorreu um erro durante a importação:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
