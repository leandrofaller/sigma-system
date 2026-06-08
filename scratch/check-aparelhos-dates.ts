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

async function main() {
  const csvPath = 'C:\\Users\\leand\\Downloads\\APARELHOS CELULARES RECEBIDOS PELA GIP (respostas) - Respostas ao formulário 1.csv'
  const text = fs.readFileSync(csvPath, 'utf-8')
  const rawLines = text.split(/\r?\n/)
  const lines = rawLines.filter(line => line.trim() !== '')

  const dbAparelhos = await prisma.aparelhoApreendido.findMany()

  // Mapear DB por responsável, município, marca para encontrar o item exato correspondente
  const findInDb = (responsavel: string, municipio: string, marca: string, dataOriginalStr: string) => {
    return dbAparelhos.filter(item => 
      item.responsavel === responsavel && 
      item.municipio === municipio &&
      item.marca === (marca || null)
    )
  }

  const linhasParaTestar = [660, 778, 1097, 1116, 1122]

  console.log('--- Buscando os registros específicos do CSV no Banco ---')
  for (const lineNum of linhasParaTestar) {
    const cols = parseCSVLine(lines[lineNum - 1]) // 0-indexed line num
    const csvTimestamp = cols[0]
    const csvResponsavel = cols[1]
    const csvDataArrecadacao = cols[2]
    const csvDataRecebimento = cols[3]
    const csvMunicipio = cols[4]
    const csvMarca = cols[10]

    const matches = findInDb(csvResponsavel, csvMunicipio, csvMarca, csvDataArrecadacao)
    console.log(`\nLinha CSV ${lineNum}:`)
    console.log(`  CSV: Resp="${csvResponsavel}" | Municipio="${csvMunicipio}" | Marca="${csvMarca}"`)
    console.log(`  CSV: Data Arrecadacao="${csvDataArrecadacao}" | Data Recebimento="${csvDataRecebimento}"`)
    
    if (matches.length > 0) {
      console.log(`  Correspondências encontradas no banco (${matches.length}):`)
      for (const m of matches) {
        console.log(`    DB ID=${m.id}:`)
        console.log(`      Data Arrecadacao: ${m.dataArrecadacao?.toISOString()}`)
        console.log(`      Data Recebimento: ${m.dataRecebimento?.toISOString()}`)
      }
    } else {
      console.log(`  ❌ Nenhuma correspondência encontrada no banco!`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
