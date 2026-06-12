import { writeFileSync } from 'fs'
import * as cheerio from 'cheerio'

const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL ?? 'http://localhost:8000'

async function requestSipeViaProxy(path: string, options: any = {}, unitId: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const method = options.method ?? 'GET'
  const url = method === 'GET'
    ? `${SIPE_PYTHON_API_URL}/sipe/proxy?path=${encodeURIComponent(cleanPath)}`
    : `${SIPE_PYTHON_API_URL}/sipe/proxy`

  const res = await fetch(url, {
    method,
    headers: {
      'Accept': 'application/json',
      'X-Sipe-Unidade': unitId,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method === 'POST' ? JSON.stringify({
      path: cleanPath,
      method,
      ...options
    }) : undefined
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
    await requestSipeViaProxy(`/selectRole`, {}, unitId).catch(() => {})
    
    console.log(`Selecionando o apenado ${sipeId} (Abraão de Almeida)...`)
    await requestSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`, {}, unitId).catch(() => {})
    
    console.log(`Pegando a página de edição para extrair CSRF token...`)
    const editRes = await requestSipeViaProxy(`/apenados/${sipeId}/editar`, {}, unitId)
    const html = editRes.html || ''
    
    // Extrai o csrf token usando Cheerio
    const $edit = cheerio.load(html)
    const csrfToken = $edit('input[name="_token"]').val()?.toString() || $edit('meta[name="csrf-token"]').attr('content')
    
    if (!csrfToken) {
      console.error('CSRF token não encontrado!')
      return
    }
    console.log(`CSRF token encontrado: ${csrfToken}`)

    console.log(`Solicitando Ficha Geral via POST...`)
    const proxyData = await requestSipeViaProxy('/relatorios/fichaGeral', {
      method: 'POST',
      form: {
        _token: csrfToken,
        apenado_id: String(sipeId),
        'listar[]': ['DP', 'M'] // CORREÇÃO: Usando 'listar[]' com colchetes
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }, unitId)
    
    if (proxyData && proxyData.html) {
      const filepath = 'scratch/ficha-geral-31417.html'
      writeFileSync(filepath, proxyData.html)
      console.log(`HTML da Ficha Geral salvo em ${filepath} (tamanho: ${proxyData.html.length} bytes)`)
      
      const $ = cheerio.load(proxyData.html)
      console.log('\n--- TABELAS NA FICHA GERAL ---')
      $('table').each((i, el) => {
        const headers: string[] = []
        $(el).find('thead tr th, thead tr td, tr:first-child th, tr:first-child td').each((_, th) => {
          headers.push($(th).text().trim())
        })
        console.log(`Tabela ${i}: headers =`, headers)
        console.log(`  Quantidade de linhas no tbody:`, $(el).find('tbody tr').length)
      })
    } else {
      console.error('Nenhum HTML retornado pelo proxy para Ficha Geral.', proxyData)
    }
  } catch (err: any) {
    console.error('Erro ao baixar Ficha Geral:', err.message)
  }
}

main()
