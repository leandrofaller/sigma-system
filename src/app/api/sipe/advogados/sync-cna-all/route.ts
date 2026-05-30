import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { chromium } from 'playwright'
import { scrapeCnaOabDetails } from '@/lib/sipe-scraper'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  // Buscar todos os advogados que possuem OAB cadastrada no sistema
  const advogados = await prisma.sipeAdvogado.findMany({
    where: {
      oab: { not: null },
    },
    select: {
      id: true,
      oab: true,
      nome: true,
    },
  })

  if (advogados.length === 0) {
    return NextResponse.json({ message: 'Nenhum advogado com OAB cadastrada para sincronizar.' })
  }

  // Iniciar o processo em background (auto-executável para liberar a resposta da API imediatamente)
  ;(async () => {
    console.log(`[CNA API OAB] Iniciando sincronização em lote para ${advogados.length} advogados em segundo plano...`)
    
    let browserInstance;
    try {
      const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
      browserInstance = await chromium.launch({
        headless: true,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
        ],
        ...(executablePath ? { executablePath } : {}),
      })

      const context = await browserInstance.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      })

      const page = await context.newPage()

      for (const adv of advogados) {
        if (adv.oab) {
          console.log(`[CNA API OAB] Sincronizando advogado: ${adv.nome} (${adv.oab})`)
          try {
            await scrapeCnaOabDetails(page, adv.id, adv.oab)
            // Delay de 2 a 4 segundos entre as requisições para evitar bloqueios de IP agressivos
            await page.waitForTimeout(2000 + Math.random() * 2000)
          } catch (err) {
            console.error(`[CNA API OAB] Erro ao sincronizar ${adv.nome} (${adv.oab}):`, err)
          }
        }
      }
    } catch (err) {
      console.error('[CNA API OAB] Erro fatal no lote de sincronização:', err)
    } finally {
      if (browserInstance) {
        await browserInstance.close().catch(() => {})
      }
      console.log('[CNA API OAB] Sincronização em lote finalizada.')
    }
  })()

  return NextResponse.json({
    success: true,
    message: `Sincronização de fotos/contatos via CNA iniciada em segundo plano para ${advogados.length} advogados.`,
  })
}
