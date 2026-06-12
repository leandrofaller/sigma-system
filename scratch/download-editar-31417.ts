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
    const unitId = '25' // JONAS FERRETI (where Abraão is)
    
    console.log(`Selecionando unidade ${unitId}...`)
    await requestSipeViaProxy(`/selectRole`, unitId).catch(() => {})
    
    console.log(`Selecionando apenado ${sipeId}...`)
    await requestSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`, unitId).catch(() => {})
    
    console.log(`Baixando HTML de editar para o apenado ${sipeId}...`)
    const proxyData = await requestSipeViaProxy(`/apenados/${sipeId}/editar`, unitId)
    
    if (proxyData && proxyData.html) {
      const filepath = 'scratch/editar-31417.html'
      writeFileSync(filepath, proxyData.html)
      console.log(`HTML salvo em ${filepath} (tamanho: ${proxyData.html.length} bytes)`)
      
      const $ = cheerio.load(proxyData.html)
      console.log('\n--- LINKS E BOTÕES DE IMPRESSÃO/RELATÓRIO ---')
      $('a, button, input[type="button"]').each((i, el) => {
        const text = $(el).text().trim() || $(el).attr('value') || ''
        const href = $(el).attr('href') || ''
        const onclick = $(el).attr('onclick') || ''
        
        if (/imprimir|pdf|relatorio|ficha|print/i.test(text) || /imprimir|pdf|relatorio|print/i.test(href) || /imprimir|pdf|relatorio|print/i.test(onclick)) {
          console.log(`Link ${i}: text="${text}" href="${href}" onclick="${onclick}"`)
        }
      })
    }
  } catch (err: any) {
    console.error('Erro:', err.message)
  }
}

main()
