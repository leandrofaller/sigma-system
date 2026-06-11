import { prisma } from '../src/lib/db'
import { writeFileSync } from 'fs'

// Simular a função fetchSipeViaProxy localmente
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
    const sipeId = 41920
    console.log(`Selecionando o apenado ${sipeId} na sessão...`)
    await requestSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`).catch(() => {})
    
    console.log(`Baixando HTML da página de edição do apenado ${sipeId}...`)
    const proxyData = await requestSipeViaProxy(`/apenados/${sipeId}/editar`)
    
    if (proxyData && proxyData.html) {
      const filepath = 'scratch/abdiel-editar.html'
      writeFileSync(filepath, proxyData.html)
      console.log(`HTML salvo em ${filepath} (tamanho: ${proxyData.html.length} bytes)`)
    } else {
      console.error('Nenhum HTML retornado pelo proxy.', proxyData)
    }
  } catch (err) {
    console.error('Erro ao baixar HTML:', err)
  }
}

main()
