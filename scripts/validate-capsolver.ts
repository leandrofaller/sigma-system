/**
 * Script de validação do Capsolver
 * Testa se a integração com Capsolver está funcionando corretamente
 * Ajuda a diagnosticar problemas antes de rodar a sincronização completa
 */

import axios, { AxiosError } from 'axios'
import fs from 'fs'
import path from 'path'

// Carregar .env manualmente
const envPath = path.join(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach((line) => {
    const [key, ...values] = line.split('=')
    if (key && key.trim() && !key.startsWith('#')) {
      const value = values.join('=').trim()
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value.replace(/^["']|["']$/g, '')
      }
    }
  })
}

const CAPSOLVER_API_URL = 'https://api.capsolver.com'
const CAPSOLVER_API_KEY = process.env.CAPSOLVER_API_KEY || ''

// Cores para output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
}

function log(message: string, color: string = 'reset') {
  console.log(`${colors[color as keyof typeof colors]}${message}${colors.reset}`)
}

function section(title: string) {
  log('')
  log('━'.repeat(50), 'blue')
  log(`🔍 ${title}`, 'blue')
  log('━'.repeat(50), 'blue')
  log('')
}

async function validateApiKey(): Promise<boolean> {
  log('1️⃣  Validando API Key...', 'yellow')

  if (!CAPSOLVER_API_KEY) {
    log('   ❌ CAPSOLVER_API_KEY não está configurada em .env', 'red')
    log('   👉 Adicione em .env: CAPSOLVER_API_KEY="CAP-..."', 'red')
    return false
  }

  if (!CAPSOLVER_API_KEY.startsWith('CAP-')) {
    log(`   ⚠️  API Key não começa com "CAP-" (começa com "${CAPSOLVER_API_KEY.substring(0, 4)}")`, 'yellow')
  }

  const masked = CAPSOLVER_API_KEY.substring(0, 10) + '...' + CAPSOLVER_API_KEY.substring(-5)
  log(`   ✅ API Key configurada: ${masked}`, 'green')
  return true
}

async function testConnection(): Promise<boolean> {
  log('2️⃣  Testando conexão com Capsolver...', 'yellow')

  try {
    const response = await axios.post(`${CAPSOLVER_API_URL}/createTask`, {
      clientKey: CAPSOLVER_API_KEY,
      task: {
        type: 'ReCaptchaV3TaskProxyless',
        websiteURL: 'https://example.com',
        websiteKey: 'invalid-test-key-12345-67890-test',
        pageAction: 'submit',
      },
      softID: 3432,
      languagePool: 'pt',
    })

    if (response.status === 200) {
      log(`   ✅ Conexão estabelecida (HTTP ${response.status})`, 'green')

      // Verificar se há erro na resposta
      if (response.data.errorId && response.data.errorId !== 0) {
        const error = response.data.errorCode || response.data.errorId
        log(`   ⚠️  API retornou erro: ${error}`, 'yellow')
        log(`   💬 Detalhes: ${response.data.errorDescription || 'Sem detalhes'}`, 'yellow')

        if (error.includes('401') || response.data.errorCode === 'ERROR_AUTH_FAILED') {
          log(`   ❌ PROBLEMA: API key inválida ou expirada`, 'red')
          return false
        }

        // Task foi criada mesmo com erro? (Às vezes Capsolver retorna sucesso com error)
        if (!response.data.taskId) {
          return false
        }
      }

      return true
    } else {
      log(`   ❌ Conexão falhou (HTTP ${response.status})`, 'red')
      return false
    }
  } catch (error: unknown) {
    const axiosError = error as AxiosError<any>
    const status = axiosError?.response?.status
    const errorData = axiosError?.response?.data

    if (status === 401) {
      log(`   ❌ HTTP 401 Unauthorized`, 'red')
      log(`   💬 Motivo: API key inválida ou expirada`, 'red')
      log(`   👉 Verifique sua chave em https://www.capsolver.com/dashboard/account`, 'red')
      return false
    }

    if (status === 400) {
      log(`   ❌ HTTP 400 Bad Request`, 'red')
      log(`   💬 Erro: ${errorData?.errorDescription || errorData?.message || 'Requisição inválida'}`, 'red')
      return false
    }

    if (status && status >= 500) {
      log(`   ❌ HTTP ${status} Server Error`, 'red')
      log(`   💬 Capsolver está indisponível`, 'red')
      return false
    }

    if (!axiosError?.response) {
      log(`   ❌ Erro de conexão: ${(error as Error)?.message || 'Desconhecido'}`, 'red')
      log(`   👉 Verifique sua conexão de internet`, 'red')
      return false
    }

    log(`   ❌ Erro desconhecido: ${(error as Error)?.message}`, 'red')
    return false
  }
}

async function testCreateTask(): Promise<string | null> {
  log('3️⃣  Testando criação de task...', 'yellow')

  try {
    const response = await axios.post(`${CAPSOLVER_API_URL}/createTask`, {
      clientKey: CAPSOLVER_API_KEY,
      task: {
        type: 'ReCaptchaV3TaskProxyless',
        websiteURL: 'https://cna.oab.org.br/',
        websiteKey: '6LeVE7sqqAAAAAJKhjR1KDX5SsWC1yqR0I_MF8Hv', // Chave real do CNA
        pageAction: 'submit',
      },
      softID: 3432,
      languagePool: 'pt',
    })

    // Verificar erros
    if (response.data.errorId && response.data.errorId !== 0) {
      log(`   ❌ Task criação falhou`, 'red')
      log(`   💬 Código de erro: ${response.data.errorCode}`, 'red')
      log(`   💬 Detalhes: ${response.data.errorDescription || 'Sem detalhes'}`, 'red')

      if (response.data.errorCode === 'ERROR_INVALID_TASK_DATA') {
        log(`   👉 Problema: Website URL ou website key inválidos`, 'red')
        log(`   👉 Ou Capsolver não suporta este website/chave`, 'red')
      } else if (response.data.errorCode === 'ERROR_AUTH_FAILED') {
        log(`   👉 Problema: API key inválida`, 'red')
      } else if (response.data.errorCode === 'ERROR_BALANCE_INSUFFICIENT') {
        log(`   👉 Problema: Saldo insuficiente na conta Capsolver`, 'red')
        log(`   👉 Carregue créditos em https://www.capsolver.com/dashboard/account`, 'red')
      }

      return null
    }

    if (!response.data.taskId) {
      log(`   ❌ Task não foi criada (sem taskId)`, 'red')
      return null
    }

    log(`   ✅ Task criada com sucesso`, 'green')
    log(`   📌 ID da task: ${response.data.taskId}`, 'green')
    return response.data.taskId
  } catch (error: unknown) {
    const axiosError = error as AxiosError<any>
    log(`   ❌ Erro ao criar task: ${(error as Error)?.message}`, 'red')

    if (axiosError?.response?.status === 429) {
      log(`   👉 Problema: Rate limit - você fez muitas requisições`, 'red')
      log(`   👉 Aguarde alguns minutos antes de tentar novamente`, 'red')
    }

    return null
  }
}

async function testPolling(taskId: string): Promise<boolean> {
  log('4️⃣  Testando polling de resultado...', 'yellow')

  let attempts = 0
  const maxAttempts = 60 // 2 minutos (60 × 2s)

  while (attempts < maxAttempts) {
    attempts++

    try {
      const response = await axios.post(`${CAPSOLVER_API_URL}/getTaskResult`, {
        clientKey: CAPSOLVER_API_KEY,
        taskId: taskId,
      })

      // Verificar erros
      if (response.data.errorId && response.data.errorId !== 0) {
        log(`   ❌ Erro no polling: ${response.data.errorCode}`, 'red')
        return false
      }

      const status = response.data.status

      if (status === 'processing') {
        if (attempts % 5 === 0) {
          log(`   ⏳ Processando... (${attempts * 2}s)`, 'dim')
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
        continue
      }

      if (status === 'ready') {
        if (response.data.solution && response.data.solution.gRecaptchaResponse) {
          log(`   ✅ CAPTCHA resolvido com sucesso!`, 'green')
          log(`   ⏱️  Tempo levado: ${(attempts * 2) / 1000} segundos`, 'green')
          const token = response.data.solution.gRecaptchaResponse
          const masked = token.substring(0, 20) + '...' + token.substring(-10)
          log(`   🔑 Token: ${masked}`, 'green')
          return true
        } else {
          log(`   ❌ Task pronta mas sem token`, 'red')
          return false
        }
      }

      log(`   ❌ Status desconhecido: ${status}`, 'red')
      return false
    } catch (error: unknown) {
      log(`   ❌ Erro no polling: ${(error as Error)?.message}`, 'red')
      return false
    }
  }

  log(`   ❌ Timeout: CAPTCHA não foi resolvido em 2 minutos`, 'red')
  log(`   👉 Capsolver pode estar lento ou overloaded`, 'red')
  return false
}

async function main() {
  section('VALIDAÇÃO DE INTEGRAÇÃO CAPSOLVER')

  try {
    // Passo 1: Validar API Key
    if (!(await validateApiKey())) {
      log('')
      log('❌ FALHA: API Key não está configurada corretamente', 'red')
      log('👉 Por favor, configure CAPSOLVER_API_KEY em .env e tente novamente', 'red')
      process.exit(1)
    }

    log('')

    // Passo 2: Testar conexão
    if (!(await testConnection())) {
      log('')
      log('⚠️  AVISO: Falha ao conectar com Capsolver', 'yellow')
      log('👉 Verifique sua API key e conexão de internet', 'yellow')
      log('')
      log('Continuando com testes mais específicos...', 'dim')
      log('')
    } else {
      log('')
    }

    // Passo 3: Testar criação de task
    const taskId = await testCreateTask()
    if (!taskId) {
      log('')
      log('❌ FALHA: Não foi possível criar uma task', 'red')
      log('👉 Verifique:', 'red')
      log('   1. Se API key é válida', 'red')
      log('   2. Se tem saldo/créditos na conta Capsolver', 'red')
      log('   3. Se Capsolver suporta esta configuração', 'red')
      process.exit(1)
    }

    log('')

    // Passo 4: Testar polling
    const pollSuccess = await testPolling(taskId)
    if (!pollSuccess) {
      log('')
      log('⚠️  AVISO: Erro ao buscar resultado do CAPTCHA', 'yellow')
      log('👉 Capsolver pode estar indisponível ou lento', 'yellow')
    }

    // Resultado final
    log('')
    log('═'.repeat(50), 'blue')
    if (pollSuccess) {
      log('✅ CAPSOLVER ESTÁ FUNCIONANDO CORRETAMENTE!', 'green')
      log('═'.repeat(50), 'blue')
      log('Você pode agora rodar a sincronização CNA com confiança.', 'green')
      log('')
      process.exit(0)
    } else {
      log('⚠️  ALGUNS TESTES FALHARAM', 'yellow')
      log('═'.repeat(50), 'blue')
      log('Por favor, verifique os erros acima e tente novamente.', 'yellow')
      log('')
      process.exit(1)
    }
  } catch (error: unknown) {
    log('')
    log('❌ ERRO INESPERADO', 'red')
    log((error as Error)?.message || String(error), 'red')
    process.exit(1)
  }
}

main()
