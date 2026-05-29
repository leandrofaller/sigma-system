import { queryAI } from '../src/lib/ai'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Testando conexão com a API do Gemini com usuário real do banco...')
  
  const user = await prisma.user.findFirst({
    select: { id: true }
  })
  
  if (!user) {
    console.error('Nenhum usuário encontrado no banco para realizar o teste.')
    return
  }

  try {
    const response = await queryAI(user.id, 'Olá! Responda apenas: OK - Conexão funcionando.')
    console.log('\n=== RESPOSTA DO GEMINI ===')
    console.log(response)
    console.log('==========================\n')
    console.log('✅ Teste de conexão concluído com SUCESSO!')
  } catch (err: any) {
    console.error('❌ Falha ao conectar com o Gemini:', err.message || err)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
