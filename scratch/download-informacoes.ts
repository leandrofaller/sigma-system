import { writeFileSync } from 'fs'
import * as cheerio from 'cheerio'

const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL ?? 'http://localhost:8000'

async function requestSipeViaProxy(path: string, unitId: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `${SIPE_PYTHON_API_URL}/sipe/proxy?path=${encodeURIComponent(cleanPath)}`
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Sipe-Unidade': unitId,
    }
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return await res.json()
}

async function main() {
  try {
    const sipeId = 31417
    const unitId = '25' // JONAS FERRETI
    
    console.log(`Selecionando unidade ${unitId}...`)
    await requestSipeViaProxy(`/selectRole`, unitId).catch(() => {})
    
    console.log(`Selecionando apenado ${sipeId}...`)
    await requestSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`, unitId).catch(() => {})
    
    console.log(`Baixando HTML de informacoes para o apenado ${sipeId}...`)
    const proxyData = await requestSipeViaProxy(`/apenados/${sipeId}/informacoes`, unitId)
    
    if (proxyData && proxyData.html) {
      const filepath = 'scratch/informacoes-31417.html'
      writeFileSync(filepath, proxyData.html)
      console.log(`HTML salvo em ${filepath} (tamanho: ${proxyData.html.length} bytes)`)
      
      const $ = cheerio.load(proxyData.html)
      console.log('\n--- TABELAS EM INFORMAÇÕES ADICIONAIS ---')
      $('table').each((i, el) => {
        const headers: string[] = []
        $(el).find('thead tr th, thead tr td, tr:first-child th, tr:first-child td').each((_, th) => {
          headers.push($(th).text().trim())
        })
        console.log(`Tabela ${i}: headers =`, headers)
        console.log(`  Linhas:`, $(el).find('tbody tr, tr').length)
      })
    }
  } catch (err: any) {
    console.error('Erro:', err.message)
  }
}

main()
