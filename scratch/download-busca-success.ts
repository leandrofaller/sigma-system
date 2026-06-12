import { writeFileSync } from 'fs'
import * as cheerio from 'cheerio'

const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL ?? 'http://localhost:8000'
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

async function requestSipeViaProxy(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `${SIPE_PYTHON_API_URL}/sipe/proxy?path=${encodeURIComponent(cleanPath)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return await res.json()
}

async function main() {
  try {
    console.log('Baixando relatorios/busca...')
    const res = await requestSipeViaProxy(`/relatorios/busca`)
    if (res && res.html) {
      writeFileSync('scratch/busca-form.html', res.html)
      console.log('Salvo scratch/busca-form.html')
      
      const $ = cheerio.load(res.html)
      console.log('\n--- CHECKBOXES / INPUTS NO FORMULÁRIO ---')
      $('input[type="checkbox"], input[type="radio"], select, option').each((i, el) => {
        const name = $(el).attr('name')
        const value = $(el).attr('value')
        const label = $(el).parent().text().trim() || $(el).text().trim()
        console.log(`Input ${i}: name="${name}" value="${value}" label="${label}"`)
      })
    }
  } catch (err: any) {
    console.error('Erro:', err.message)
  }
}

main()
