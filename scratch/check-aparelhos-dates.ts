import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'

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
        i++
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

function parseDateUTC(dateStr: string): Date | null {
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

  return new Date(Date.UTC(year, month, day, hours, minutes, seconds))
}

async function main() {
  const csvPath = 'C:\\Users\\leand\\Downloads\\APARELHOS CELULARES RECEBIDOS PELA GIP (respostas) - Respostas ao formulário 1.csv'
  const text = fs.readFileSync(csvPath, 'utf-8')
  const rawLines = text.split(/\r?\n/)
  const lines = rawLines.filter(line => line.trim() !== '')

  const dbAparelhos = await prisma.aparelhoApreendido.findMany({
    orderBy: { id: 'asc' }
  })

  let totalDivergencias = 0
  console.log('--- Comparando datas Banco vs CSV 1:1 ---')

  for (let i = 1; i < lines.length; i++) {
    const columns = parseCSVLine(lines[i])
    const csvDataArrecadacaoStr = columns[2]
    const csvDataRecebimentoStr = columns[3]

    const dbItem = dbAparelhos[i - 1]
    if (!dbItem) continue

    const parsedArrecadacao = parseDateUTC(csvDataArrecadacaoStr)
    const dbArrecadacao = dbItem.dataArrecadacao

    if (parsedArrecadacao?.toISOString() !== dbArrecadacao?.toISOString()) {
      totalDivergencias++
      if (totalDivergencias <= 10) {
        console.log(`Divergência #${totalDivergencias} na linha ${i}:`)
        console.log(`  CSV: "${csvDataArrecadacaoStr}" -> Esperado (UTC): ${parsedArrecadacao?.toISOString()}`)
        console.log(`  DB : ${dbArrecadacao?.toISOString()}`)
      }
    }
  }

  console.log(`\nTotal de divergências encontradas: ${totalDivergencias}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
