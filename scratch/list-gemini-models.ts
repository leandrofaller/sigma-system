import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const cfg = await prisma.systemConfig.findUnique({ where: { key: 'gemini_api_key' } })
  const apiKey = (cfg?.value as any)?.key?.trim()

  if (!apiKey) {
    console.error('Chave de API do Gemini não encontrada no banco de dados.')
    return
  }

  console.log(`Chave encontrada: ${apiKey.substring(0, 8)}...`)
  console.log('Buscando modelos disponíveis no Google AI Studio...')

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (!res.ok) {
      throw new Error(`Erro API Gemini: ${res.statusText}`)
    }
    const data = await res.json()
    console.log('\n=== MODELOS DISPONÍVEIS ===')
    const models = data.models || []
    models.forEach((m: any) => {
      // Filtrar apenas modelos que suportam generateContent
      if (m.supportedGenerationMethods?.includes('generateContent')) {
        console.log(`- ID: ${m.name.replace('models/', '')} | Display: ${m.displayName}`)
      }
    })
  } catch (err: any) {
    console.error('Erro ao consultar modelos:', err.message || err)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
