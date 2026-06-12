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

async function testListOption(option: string, csrfToken: string, sipeId: number, unitId: string) {
  try {
    console.log(`Testando opção de listar: ${option}...`)
    const proxyData = await requestSipeViaProxy('/relatorios/fichaGeral', {
      method: 'POST',
      form: {
        _token: csrfToken,
        apenado_id: String(sipeId),
        'listar[]': ['DP', option] // Testamos DP + a opção
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }, unitId)
    
    const html = proxyData?.html || ''
    console.log(`  Tamanho do HTML: ${html.length} bytes`)
    
    if (html.includes('HISTÓRICO MUDANÇA') || html.includes('MUDANÇA DE CELA') || html.includes('CELA')) {
      console.log(`  🎉 ENCONTRADO CELA/MUDANÇA NO HTML!`)
      // Vamos salvar para analisar!
      writeFileSync(`scratch/ficha-geral-opt-${option}.html`, html)
      
      const $ = cheerio.load(html)
      $('table').each((i, el) => {
        const headers: string[] = []
        $(el).find('thead tr th, thead tr td, tr:first-child th, tr:first-child td').each((_, th) => {
          headers.push($(th).text().trim())
        })
        console.log(`    Tabela ${i}: headers =`, headers)
      })
    }
  } catch (err: any) {
    console.log(`  Erro com opção ${option}: ${err.message}`)
  }
}

async function main() {
  try {
    const sipeId = 31417
    const unitId = '23'
    
    console.log(`Selecionando unidade ${unitId}...`)
    await requestSipeViaProxy(`/selectRole`, {}, unitId).catch(() => {})
    
    console.log(`Selecionando o apenado ${sipeId}...`)
    await requestSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`, {}, unitId).catch(() => {})
    
    console.log(`Pegando a página de edição para extrair CSRF token...`)
    const editRes = await requestSipeViaProxy(`/apenados/${sipeId}/editar`, {}, unitId)
    const html = editRes.html || ''
    
    const $edit = cheerio.load(html)
    const csrfToken = $edit('input[name="_token"]').val()?.toString() || $edit('meta[name="csrf-token"]').attr('content')
    
    if (!csrfToken) {
      console.error('CSRF token não encontrado!')
      return
    }
    console.log(`CSRF token encontrado: ${csrfToken}\n`)

    const optionsToTest = [
      'M', 'MC', 'C', 'H', 'HC', 'CELA', 'CELAS', 'MUDANÇA', 'MUDANCAS', 'HISTORICO',
      'P', 'D', 'O', 'V', 'A', 'T', 'R', 'E'
    ]

    for (const opt of optionsToTest) {
      await testListOption(opt, csrfToken, sipeId, unitId)
    }

  } catch (err: any) {
    console.error('Erro geral:', err.message)
  }
}

main()
