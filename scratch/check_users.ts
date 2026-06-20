import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Buscando usuários no banco de dados...')
  const users = await prisma.user.findMany()
  console.log(`Total de usuários encontrados: ${users.length}`)
  for (const u of users) {
    console.log(`- ID: ${u.id} | Nome: ${u.name} | E-mail: ${u.email} | Role: ${u.role}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
