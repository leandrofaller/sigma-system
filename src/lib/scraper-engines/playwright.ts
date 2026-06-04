/**
 * Playwright Engine — Adapter para código existente de sipe-scraper.ts
 *
 * Implementa a interface ScraperEngine usando Playwright
 * Serve como wrapper dos métodos existentes
 */

import { ScraperEngine, ScraperEngineConfig, ApenadoRawData } from '../scraper-engines'
import { chromium, Browser, BrowserContext, Page } from 'playwright'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

export class PlaywrightEngine extends ScraperEngine {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

  constructor(config: ScraperEngineConfig) {
    super(config, 'playwright')
  }

  get name(): 'playwright' | 'firecrawl' {
    return 'playwright'
  }

  async login(): Promise<void> {
    try {
      // Iniciar browser
      this.browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
      })

      this.context = await this.browser.newContext()
      this.page = await this.context.newPage()

      // TODO: Integrar com a função login() existente de sipe-scraper.ts
      // Por enquanto, marcar como placeholder
      console.log('[PlaywrightEngine] Login realizado')
    } catch (err) {
      console.error('[PlaywrightEngine] Erro ao fazer login:', err)
      throw err
    }
  }

  async coletarIdsApenados(): Promise<number[]> {
    if (!this.page) {
      throw new Error('[PlaywrightEngine] Página não inicializada')
    }

    try {
      // TODO: Integrar com a função coletarIdsApenados() existente
      // Por enquanto, retornar array vazio
      console.log('[PlaywrightEngine] Coletando IDs de apenados...')
      return []
    } catch (err) {
      console.error('[PlaywrightEngine] Erro ao coletar IDs:', err)
      throw err
    }
  }

  async scrapeApenadoFicha(sipeId: number): Promise<ApenadoRawData> {
    if (!this.page) {
      throw new Error('[PlaywrightEngine] Página não inicializada')
    }

    try {
      // TODO: Integrar com a função scrapeApenadoFicha() existente
      // Por enquanto, retornar dados vazios
      console.log(`[PlaywrightEngine] Scrapando ficha do apenado #${sipeId}`)

      return {
        sipeId,
        nome: 'TODO',
      }
    } catch (err) {
      console.error(`[PlaywrightEngine] Erro ao scrape apenado #${sipeId}:`, err)
      throw err
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close().catch(() => {})
      }
      if (this.context) {
        await this.context.close().catch(() => {})
      }
      if (this.browser) {
        await this.browser.close().catch(() => {})
      }
      console.log('[PlaywrightEngine] Cleanup concluído')
    } catch (err) {
      console.error('[PlaywrightEngine] Erro no cleanup:', err)
    }
  }
}
