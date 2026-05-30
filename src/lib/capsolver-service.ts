/**
 * Capsolver Integration Service
 * Resolves reCAPTCHA using https://www.capsolver.com/
 */

import axios, { AxiosInstance } from 'axios'

const CAPSOLVER_API_URL = 'https://api.capsolver.com'
const CAPSOLVER_API_KEY = process.env.CAPSOLVER_API_KEY || ''

interface CapsolverTask {
  type: string
  websiteURL: string
  websiteKey: string
  [key: string]: any
}

interface CapsolverResponse {
  errorId: number
  errorCode?: string
  taskId?: string
  solution?: {
    gRecaptchaResponse?: string
  }
  status?: string
}

class CapsolverService {
  private apiKey: string
  private client: AxiosInstance

  constructor(apiKey: string = CAPSOLVER_API_KEY) {
    this.apiKey = apiKey

    if (!this.apiKey) {
      console.warn('[Capsolver] ⚠️ CAPSOLVER_API_KEY não configurada no .env')
    }

    this.client = axios.create({
      baseURL: CAPSOLVER_API_URL,
      timeout: 120000, // 2 minutos
    })
  }

  /**
   * Detecta reCAPTCHA v3 na página e retorna a chave do site
   */
  async detectRecaptchaKey(page: any): Promise<string | null> {
    try {
      // Estratégia 1: Tenta extrair do DOM com retry
      for (let attempt = 0; attempt < 3; attempt++) {
        const sitekey = await page.evaluate(() => {
          // Procura em data-sitekey
          const elem = document.querySelector('[data-sitekey]')
          if (elem) {
            const key = elem.getAttribute('data-sitekey')
            if (key && key.length >= 30) return key
          }

          // Procura em divs/iframes
          const iframes = Array.from(document.querySelectorAll('div[data-sitekey], iframe[data-sitekey]'))
          for (const iframe of iframes) {
            const key = iframe.getAttribute('data-sitekey')
            if (key && key.length >= 30) return key
          }

          return null
        })

        if (sitekey) {
          console.log(`[Capsolver] ✓ Chave detectada no DOM na tentativa ${attempt + 1}`)
          return sitekey
        }

        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      // Estratégia 2: Tenta extrair do HTML bruto
      try {
        const content = await page.content()

        // Procura por data-sitekey="..."
        const match1 = content.match(/data-sitekey=["']([a-zA-Z0-9_-]{35,})["']/i)
        if (match1 && match1[1]) {
          console.log(`[Capsolver] ✓ Chave detectada no HTML (data-sitekey)`)
          return match1[1]
        }

        // Procura por "sitekey":"..."
        const match2 = content.match(/["']sitekey["']\s*:\s*["']([a-zA-Z0-9_-]{35,})["']/i)
        if (match2 && match2[1]) {
          console.log(`[Capsolver] ✓ Chave detectada no HTML (sitekey JSON)`)
          return match2[1]
        }

        // Procura por strings grandes de 39-40 caracteres alfanuméricos
        const match3 = content.match(/([a-zA-Z0-9_-]{39,40})/g)
        if (match3) {
          for (const key of match3) {
            // Filtra por padrão típico de reCAPTCHA
            if (key.match(/^[a-zA-Z0-9_]{39,40}$/)) {
              console.log(`[Capsolver] ✓ Chave detectada no HTML (brute force)`)
              return key
            }
          }
        }
      } catch (err) {
        console.warn(`[Capsolver] Erro ao extrair do HTML:`, err)
      }

      console.warn('[Capsolver] ⚠️ Não foi possível detectar a chave reCAPTCHA')
      return null
    } catch (error) {
      console.error('[Capsolver] Erro ao detectar reCAPTCHA:', error)
      return null
    }
  }

  /**
   * Resolve reCAPTCHA v3 usando Capsolver
   */
  async solveRecaptchaV3(
    pageUrl: string,
    sitekey: string,
    action: string = 'submit'
  ): Promise<string | null> {
    try {
      if (!this.apiKey) {
        console.warn('[Capsolver] API Key não configurada, pulando resolução')
        return null
      }

      console.log(`[Capsolver] 🔓 Iniciando resolução de reCAPTCHA v3...`)
      console.log(`  URL: ${pageUrl}`)
      console.log(`  Chave: ${sitekey.substring(0, 10)}...`)

      // 1. Criar task
      const createTaskResponse = await this.client.post<CapsolverResponse>('/createTask', {
        clientKey: this.apiKey,
        task: {
          type: 'ReCaptchaV3TaskProxyless',
          websiteURL: pageUrl,
          websiteKey: sitekey,
          pageAction: action,
        },
        softID: 3432,
        languagePool: 'pt',
      })

      if (createTaskResponse.data.errorId !== 0) {
        console.error(
          `[Capsolver] ❌ Erro ao criar task: ${createTaskResponse.data.errorCode}`
        )
        return null
      }

      const taskId = createTaskResponse.data.taskId
      console.log(`[Capsolver] ✓ Task criada: ${taskId}`)

      // 2. Polling para obter resultado
      let attempts = 0
      const maxAttempts = 60 // 2 minutos com 2s de interval

      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000))
        attempts++

        const getResultResponse = await this.client.post<CapsolverResponse>(
          '/getTaskResult',
          {
            clientKey: this.apiKey,
            taskId,
          }
        )

        const data = getResultResponse.data

        if (data.errorId !== 0) {
          console.error(`[Capsolver] ❌ Erro no polling: ${data.errorCode}`)
          return null
        }

        if (data.status === 'ready') {
          const token = data.solution?.gRecaptchaResponse
          if (token) {
            console.log(`[Capsolver] ✅ CAPTCHA resolvido em ${attempts * 2}s`)
            return token
          }
        }

        if (attempts % 5 === 0) {
          console.log(`[Capsolver] ⏳ Aguardando... (${attempts * 2}s)`)
        }
      }

      console.error('[Capsolver] ❌ Timeout ao resolver CAPTCHA')
      return null
    } catch (error) {
      console.error('[Capsolver] Erro ao resolver reCAPTCHA:', error)
      return null
    }
  }

  /**
   * Injeta o token reCAPTCHA resolvido na página
   */
  async injectRecaptchaToken(page: any, token: string): Promise<boolean> {
    try {
      const success = await page.evaluate((token: string) => {
        try {
          // Tenta injatar via iframe do reCAPTCHA
          const iframe = document.querySelector('[name^="c-"]') as HTMLIFrameElement
          if (iframe) {
            iframe.style.display = 'none'
          }

          // Define o token na janela
          const w = window as any
          w.grecaptchaToken = token

          // Dispatch evento para o formulário
          const form = document.querySelector('form')
          if (form) {
            const event = new Event('submit', { bubbles: true, cancelable: true })
            form.dispatchEvent(event)
          }

          return true
        } catch (e) {
          console.error('Erro ao injectar token:', e)
          return false
        }
      }, token)

      return success
    } catch (error) {
      console.error('[Capsolver] Erro ao injectar token:', error)
      return false
    }
  }
}

export const capsolverService = new CapsolverService()
