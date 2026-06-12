import { writeFileSync } from 'fs'
import * as cheerio from 'cheerio'

const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL ?? 'http://localhost:8000'

async function requestSipeViaProxy(path: string, unitId: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `${SIPE_PYTHON_API_URL}/sipe/proxy?path=${encodeURIComponent(cleanPath)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Sipe-Unidade': unitId,
    }
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} para unidade ${unitId}`)
  }
  return await res.json()
}

async function testUnit(unitId: string, unitNome: string) {
  try {
    const sipeId = 31417
    console.log(`\n>>> TESTANDO UNIDADE: ${unitNome} (ID: ${unitId}) <<<`)
    
    // Seleciona a unidade (selectRole)
    console.log(`Selecionando unidade ${unitId}...`)
    // Fazemos a chamada selectRole
    await requestSipeViaProxy(`/selectRole`, unitId).catch(() => {})
    
    // Seleciona o apenado
    console.log(`Selecionando apenado ${sipeId}...`)
    await requestSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`, unitId).catch(() => {})
    
    // Baixa mudarcela
    console.log(`Baixando mudarcela...`)
    const proxyData = await requestSipeViaProxy(`/apenados/${sipeId}/mudarcela`, unitId)
    
    if (proxyData && proxyData.html) {
      const $ = cheerio.load(proxyData.html)
      const table = $('table').first()
      if (!table.length) {
        console.log('Tabela não encontrada nesta unidade!')
        return
      }
      
      const headers: string[] = []
      table.find('thead tr th, thead tr td, tr:first-child th, tr:first-child td').each((_, el) => {
        headers.push($(el).text().trim())
      })
      console.log('Headers:', headers)
      
      const rows = table.find('tbody tr')
      console.log(`Quantidade de linhas: ${rows.length}`)
      
      rows.each((i, row) => {
        const cells = $(row).find('td')
        const cellTexts = cells.map((_, el) => $(el).text().trim()).get()
        console.log(`  Linha ${i}:`, cellTexts)
      })
    }
  } catch (err: any) {
    console.error(`Erro na unidade ${unitId}:`, err.message)
  }
}

async function main() {
  // Testaremos:
  // 3: CDPPVH
  // 25: JONAS FERRETI
  // 23: ARIQUEMES
  await testUnit('3', 'CDPPVH')
  await testUnit('25', 'JONAS FERRETI')
  await testUnit('23', 'ARIQUEMES')
}

main()
