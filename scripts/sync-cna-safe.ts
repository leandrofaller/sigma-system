/**
 * Sincronização CNA com proteção contra execuções simultâneas
 * Usa lock file para garantir que apenas uma sincronização rode por vez
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const LOCK_FILE = path.join(process.cwd(), '.sync-lock')
const LOCK_TIMEOUT = 60 * 60 * 1000 // 1 hora em ms

async function acquireLock(): Promise<boolean> {
  try {
    // Verifica se lock file existe
    if (fs.existsSync(LOCK_FILE)) {
      const stats = fs.statSync(LOCK_FILE)
      const lockAge = Date.now() - stats.mtimeMs

      // Se lock tem mais de 1 hora, remove (assume travamento)
      if (lockAge > LOCK_TIMEOUT) {
        console.warn('⚠️  Lock file expirado (1h+). Removendo...')
        fs.unlinkSync(LOCK_FILE)
      } else {
        // Lock ativo
        const lockContent = fs.readFileSync(LOCK_FILE, 'utf-8')
        const lockTime = new Date(parseInt(lockContent))
        const minutesAgo = Math.round(lockAge / 60000)

        console.error('❌ Sincronização já em execução!')
        console.error(`   Iniciada: ${lockTime.toLocaleTimeString()}`)
        console.error(`   Há ${minutesAgo} minuto(s) atrás`)
        console.error('')
        console.error('✅ Aguarde a conclusão ou remova manualmente:')
        console.error(`   rm ${LOCK_FILE}`)
        process.exit(1)
      }
    }

    // Cria lock file
    fs.writeFileSync(LOCK_FILE, Date.now().toString())
    console.log('🔒 Lock adquirido. Sincronização iniciada...')
    return true
  } catch (error) {
    console.error('Erro ao adquirir lock:', error)
    process.exit(1)
  }
}

async function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE)
      console.log('🔓 Lock liberado')
    }
  } catch (error) {
    console.error('Erro ao liberar lock:', error)
  }
}

async function runSync() {
  try {
    // Adquire lock
    await acquireLock()

    console.log('')
    console.log('=' .repeat(60))
    console.log('🚀 Iniciando Sincronização CNA')
    console.log('=' .repeat(60))
    console.log('')

    // Executa sincronização
    execSync('npx tsx scripts/sync-cna-manual.ts', {
      stdio: 'inherit',
      cwd: process.cwd()
    })

    console.log('')
    console.log('=' .repeat(60))
    console.log('✅ Sincronização Concluída')
    console.log('=' .repeat(60))
  } catch (error) {
    console.error('')
    console.error('=' .repeat(60))
    console.error('❌ Erro durante Sincronização')
    console.error('=' .repeat(60))
    process.exit(1)
  } finally {
    // Libera lock
    await releaseLock()
  }
}

// Limpa lock se processo for interrompido
process.on('SIGINT', async () => {
  console.log('')
  console.warn('⚠️  Sincronização interrompida pelo usuário')
  await releaseLock()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('')
  console.warn('⚠️  Sincronização finalizada por sinal do sistema')
  await releaseLock()
  process.exit(0)
})

// Inicia sincronização
runSync()
