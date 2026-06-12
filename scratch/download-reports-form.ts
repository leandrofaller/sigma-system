import { writeFileSync } from 'fs'

const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL ?? 'http://localhost:8000'
const SIPE_UNIDADE = '23'

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
    await requestSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`).catch(() => {})

    console.log('Baixando formulário de ficha geral (GET)...')
    const resFicha = await requestSipeViaProxy(`/relatorios/fichaGeral`).catch(e => ({ error: e.message }))
    if (resFicha && resFicha.html) {
      writeFileSync('scratch/ficha-geral-form.html', resFicha.html)
      console.log('Salvo scratch/ficha-geral-form.html')
    } else {
      console.log('Falha ao baixar /relatorios/fichaGeral:', resFicha)
    }

    console.log('Baixando relatorios/busca...')
    const resBusca = await requestSipeViaProxy(`/relatorios/busca`).catch(e => ({ error: e.message }))
    if (resBusca && resBusca.html) {
      writeFileSync('scratch/busca-form.html', resBusca.html)
      console.log('Salvo scratch/busca-form.html')
    } else {
      console.log('Falha ao baixar /relatorios/busca:', resBusca)
    }
  } catch (err) {
    console.error(err)
  }
}

main()
