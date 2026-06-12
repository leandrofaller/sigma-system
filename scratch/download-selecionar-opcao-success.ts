import { writeFileSync } from 'fs'
import * as cheerio from 'cheerio'

const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL ?? 'http://localhost:8000'
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

async function requestSipeViaProxy(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `${SIPE_PYTHON_API_URL}/sipe/proxy?path=${encodeURIComponent(cleanPath)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Sipe-Unidade': SIPE_UNIDADE,
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
    console.log(`Selecionando o apenado ${sipeId}...`)
    // Faz a chamada, se falhar ou redirecionar, ignoramos o erro HTTP
    try {
      await requestSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`)
    } catch (e: any) {
      console.log('SelecionarOpcao respondeu:', e.message)
    }

    console.log('Baixando HTML do selecionarOpcao com GET direto...')
    // Em muitos sistemas, selecionarOpcao define a sessão e depois redireciona para outra página,
    // ou se acessarmos diretamente, ele renderiza as opções do apenado.
    const res = await requestSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`)
    if (res && res.html) {
      const filepath = 'scratch/selecionar-opcao-31417.html'
      writeFileSync(filepath, res.html)
      console.log(`HTML salvo com sucesso.`)
      
      const $ = cheerio.load(res.html)
      console.log('\n--- TODOS OS LINKS DA PÁGINA ---')
      $('a').each((i, el) => {
        const href = $(el).attr('href')
        const text = $(el).text().trim()
        if (href && (href.includes('mudar') || href.includes('cela') || href.includes('historico') || href.includes('relatorio') || href.includes('ficha'))) {
          console.log(`Link ${i}: "${text}" -> "${href}"`)
        }
      })
    }
  } catch (err) {
    console.error('Erro:', err)
  }
}

main()
