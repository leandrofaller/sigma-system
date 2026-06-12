import { writeFileSync } from 'fs'
import * as cheerio from 'cheerio'

const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL ?? 'http://localhost:8000'

async function fetchSipeViaProxy(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `${SIPE_PYTHON_API_URL}/sipe/proxy?path=${encodeURIComponent(cleanPath)}`
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Sipe-Unidade': '14'
    }
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} para ${path}`)
  }
  return await res.json()
}

async function requestSipeViaProxy(options: { path: string, method: string, form: any, headers?: any }) {
  const cleanPath = options.path.startsWith('/') ? options.path : `/${options.path}`
  const url = `${SIPE_PYTHON_API_URL}/sipe/proxy`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Sipe-Unidade': '14'
    },
    body: JSON.stringify({
      path: cleanPath,
      method: options.method,
      form: options.form,
      headers: options.headers
    })
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} POST para ${options.path}`)
  }
  return await res.json()
}

async function main() {
  const sipeId = 72669
  try {
    console.log(`Buscando apenado ${sipeId} na listagem...`)
    const indexData = await fetchSipeViaProxy(`/apenados/index?escolha=nomeapenado&parametro=${sipeId}`)
    if (indexData && indexData.html) {
      writeFileSync('scratch/abrahan-index.html', indexData.html)
      console.log('Salvo scratch/abrahan-index.html')
      
      const $ = cheerio.load(indexData.html)
      let link: string | null = null
      
      const rows = $('table tbody tr').get()
      for (const row of rows) {
        const text = $(row).text()
        if (text.includes(String(sipeId))) {
          const a = $(row).find('a[href]')
          if (a.length) {
            link = a.attr('href') || null
            break
          }
        }
      }
      
      if (!link) {
        const anchors = $('a[href]').get()
        for (const a of anchors) {
          const href = $(a).attr('href') || ''
          if (href.includes(`/apenados/${sipeId}`)) {
            link = href
            break
          }
        }
      }
      
      console.log(`Link encontrado: ${link}`)
      if (!link) {
        console.error('Link não encontrado para o apenado!')
        return
      }

      console.log('Selecionando apenado...')
      await fetchSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`)

      const cleanLinkPath = link.replace('https://sipe.sejus.ro.gov.br', '')
      console.log(`Acessando a página de edição/visualização: ${cleanLinkPath}`)
      const editData = await fetchSipeViaProxy(cleanLinkPath)
      
      if (editData && editData.html) {
        writeFileSync('scratch/abrahan-editar.html', editData.html)
        console.log('Salvo scratch/abrahan-editar.html')
        
        const $edit = cheerio.load(editData.html)
        const csrfToken = $edit('meta[name="csrf-token"]').attr('content') || 
                          $edit('input[name="_token"]').attr('value') ||
                          editData.html.match(/CSRF_TOKEN\s*=\s*['"]([^'"]+)['"]/i)?.[1]
        console.log(`CSRF Token: ${csrfToken}`)
        
        if (csrfToken) {
          console.log('Tentando POST para /relatorios/fichaGeral...')
          try {
            const fichaGeralData = await requestSipeViaProxy({
              path: '/relatorios/fichaGeral',
              method: 'POST',
              form: {
                _token: csrfToken,
                apenado_id: String(sipeId),
                'listar[]': ['DP', 'M', 'MC', 'IP', 'T', 'V', 'A', 'IAP', 'MD', 'PA', 'IA', 'C']
              }
            })
            if (fichaGeralData && fichaGeralData.html) {
              writeFileSync('scratch/abrahan-fichaGeral.html', fichaGeralData.html)
              console.log('Salvo scratch/abrahan-fichaGeral.html')
            } else {
              console.log('fichaGeralData não tem HTML ou é vazio')
            }
          } catch (e: any) {
            console.error('Erro ao baixar fichaGeral:', e.message)
          }
        }
      }

      console.log('Baixando mudarcela...')
      try {
        const mudarCelaData = await fetchSipeViaProxy(`/apenados/${sipeId}/mudarcela`)
        if (mudarCelaData && mudarCelaData.html) {
          writeFileSync('scratch/abrahan-mudarcela.html', mudarCelaData.html)
          console.log('Salvo scratch/abrahan-mudarcela.html')
        }
      } catch (e: any) {
        console.error('Erro ao baixar mudarcela:', e.message)
      }

      console.log('Baixando informacoes...')
      try {
        const informacoesData = await fetchSipeViaProxy(`/apenados/${sipeId}/informacoes`)
        if (informacoesData && informacoesData.html) {
          writeFileSync('scratch/abrahan-informacoes.html', informacoesData.html)
          console.log('Salvo scratch/abrahan-informacoes.html')
        }
      } catch (e: any) {
        console.error('Erro ao baixar informacoes:', e.message)
      }
    }
  } catch (err: any) {
    console.error('Erro no fluxo principal:', err.message)
  }
}

main()
