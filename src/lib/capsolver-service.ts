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
   * Estratégia: Extrai a chave do URL do iframe reCAPTCHA (parâmetro k=)
   */
  async detectRecaptchaKey(page: any): Promise<string | null> {
    try {
      // Estratégia 1: Procura em data-sitekey no DOM
      for (let attempt = 0; attempt < 3; attempt++) {
        const sitekey = await page.evaluate(() => {
          // Procura em todos os elementos com data-sitekey
          const elem = document.querySelector('[data-sitekey]')
          if (elem) {
            const key = elem.getAttribute('data-sitekey')
            if (key && key.length >= 30) return key  // Aceita chaves de vários tamanhos
          }

          // Procura em QUALQUER iframe que tenha k= na URL
          const iframes = document.querySelectorAll('iframe')
          for (const iframe of iframes) {
            const src = iframe.getAttribute('src') || ''
            if (src && src.includes('k=')) {
              const match = src.match(/[?&]k=([a-zA-Z0-9_-]+)/)
              if (match && match[1] && match[1].length >= 30) {
                return match[1]
              }
            }
          }

          return null
        })

        if (sitekey) {
          console.log(`[Capsolver] ✓ Chave detectada (${sitekey.length} chars): ${sitekey.substring(0, 15)}...${sitekey.substring(-5)}`)
          return sitekey
        }

        if (attempt < 2) {
          console.log(`[Capsolver] Tentativa ${attempt + 1}/3 - aguardando...`)
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      // Estratégia 2: Extrai do HTML bruto
      try {
        const content = await page.content()
        let foundKeys: Array<{match: string, length: number, strategy: string}> = []

        // Procura por iframe src com k=
        const regex1 = /iframe[^>]*src="[^"]*k=([a-zA-Z0-9_-]+)[^"]*"/g
        let match
        while ((match = regex1.exec(content)) !== null) {
          if (match[1].length >= 30) {
            console.log(`[Capsolver] ✓ Chave detectada no HTML (iframe src, ${match[1].length} chars)`)
            return match[1]
          }
          foundKeys.push({match: match[1], length: match[1].length, strategy: 'iframe src'})
        }

        // Procura por data-sitekey=
        const match2 = content.match(/data-sitekey=["']([a-zA-Z0-9_-]+)["']/i)
        if (match2 && match2[1] && match2[1].length >= 30) {
          console.log(`[Capsolver] ✓ Chave detectada no HTML (data-sitekey, ${match2[1].length} chars)`)
          return match2[1]
        }
        if (match2 && match2[1]) {
          foundKeys.push({match: match2[1], length: match2[1].length, strategy: 'data-sitekey'})
        }

        // Procura por "sitekey": "..."
        const match3 = content.match(/["']sitekey["']\s*:\s*["']([a-zA-Z0-9_-]+)["']/i)
        if (match3 && match3[1] && match3[1].length >= 30) {
          console.log(`[Capsolver] ✓ Chave detectada no HTML (sitekey JSON, ${match3[1].length} chars)`)
          return match3[1]
        }
        if (match3 && match3[1]) {
          foundKeys.push({match: match3[1], length: match3[1].length, strategy: 'sitekey JSON'})
        }

        // Log sobre chaves encontradas mas com tamanho inválido
        if (foundKeys.length > 0) {
          console.warn(`[Capsolver] ⚠️ Chaves encontradas mas com tamanho inválido:`)
          foundKeys.forEach(k => {
            console.warn(`  - ${k.strategy}: ${k.length} chars (esperado 40)`)
          })
        }
      } catch (err) {
        console.warn(`[Capsolver] Erro ao extrair do HTML:`, err)
      }

      console.warn('[Capsolver] ⚠️ Não foi possível detectar chave reCAPTCHA com 40 caracteres')
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

      // 1. Validar sitekey (Capsolver aceita chaves de vários tamanhos)
      if (!sitekey || sitekey.length < 30) {
        console.error(`[Capsolver] ❌ Sitekey inválido: ${sitekey ? sitekey.length + ' chars' : 'não fornecido'}`)
        console.error(`[Capsolver] Sitekey muito curto (mínimo 30 caracteres)`)
        return null
      }

      console.log(`[Capsolver] ✓ Sitekey validado: ${sitekey.length} caracteres`)
      if (sitekey.length !== 40) {
        console.warn(`[Capsolver] ⚠️  Sitekey não tem 40 chars (tem ${sitekey.length}), mas tentando mesmo assim...`)
      }

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
        const errorDetails = {
          errorId: createTaskResponse.data.errorId,
          errorCode: createTaskResponse.data.errorCode,
          errorDescription: createTaskResponse.data.errorDescription,
          websiteKeyLength: sitekey.length,
        }
        console.error(
          `[Capsolver] ❌ Erro ao criar task:`,
          JSON.stringify(errorDetails, null, 2)
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
          console.error(`[Capsolver] ❌ Erro no polling:`, {
            errorCode: data.errorCode,
            errorDescription: data.errorDescription,
            taskId,
            attempt: attempts,
          })
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
