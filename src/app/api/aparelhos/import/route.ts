import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'

// Desativa limite de tamanho de payload se aplicável no NextJS
export const maxDuration = 60 // 1 minuto de timeout máximo

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
  
  const cleanStr = dateStr.trim().replace(/^['"]|['"]$/g, '') // remove aspas extras se existirem
  
  const upper = cleanStr.toUpperCase()
  if (upper === 'N/I' || upper === 'NÃO CONSTA' || upper === 'S/N' || upper === 'S/I' || upper === 'NÃO REGISTRADO NO SEI') {
    return null
  }

  // Tenta extrair a data no formato DD/MM/YYYY
  const dateTimeParts = cleanStr.split(' ')
  const dateParts = dateTimeParts[0].split('/')

  if (dateParts.length !== 3) {
    // Se não for formato barra, tenta converter diretamente (ex: ISO)
    const t = Date.parse(cleanStr)
    return isNaN(t) ? null : new Date(t)
  }

  const day = parseInt(dateParts[0], 10)
  const month = parseInt(dateParts[1], 10) - 1 // Mês 0-11
  let year = parseInt(dateParts[2], 10)

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null

  // Sanitização de anos bizarros, ex: 0222, 222
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

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const overwriteParam = formData.get('overwrite') === 'true'

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    const text = await file.text()
    
    // Divide o arquivo por linhas (suportando \r\n e \n)
    const rawLines = text.split(/\r?\n/)
    
    // Filtra linhas vazias
    const lines = rawLines.filter(line => line.trim() !== '')

    if (lines.length < 2) {
      return NextResponse.json({ error: 'Arquivo CSV vazio ou sem dados' }, { status: 400 })
    }

    // Cabeçalho (primeira linha)
    // Opcional: validar se as colunas batem de alguma forma
    const header = parseCSVLine(lines[0])

    const registrosParaInserir: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const columns = parseCSVLine(lines[i])
      
      // Se a linha tiver menos colunas que o cabeçalho ou estiver vazia, ignora
      if (columns.length < 6) continue

      // Mapeamento das colunas
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

    // Transação para deletar se overwrite for ativado e inserir em lotes
    let inseridos = 0
    await prisma.$transaction(async (tx) => {
      if (overwriteParam) {
        await tx.aparelhoApreendido.deleteMany()
      }

      // Inserção em lotes de 100 registros para otimizar desempenho e memória no PostgreSQL
      const batchSize = 100
      for (let i = 0; i < registrosParaInserir.length; i += batchSize) {
        const batch = registrosParaInserir.slice(i, i + batchSize)
        await tx.aparelhoApreendido.createMany({
          data: batch,
        })
        inseridos += batch.length
      }
    })

    // Gravar auditoria
    await createAuditLog({
      userId: (session.user as any).id,
      action: overwriteParam ? 'IMPORT_APARELHOS_OVERWRITE' : 'IMPORT_APARELHOS_MERGE',
      entity: 'AparelhoApreendido',
      details: { totalLinhasCSV: lines.length - 1, registrosInseridos: inseridos },
    })

    return NextResponse.json({
      success: true,
      message: `${inseridos} aparelhos importados com sucesso!`,
      count: inseridos,
    })
  } catch (error: any) {
    console.error('Error importing CSV:', error)
    return NextResponse.json({ error: 'Erro ao processar e importar planilha: ' + error.message }, { status: 500 })
  }
}
