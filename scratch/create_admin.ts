import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Criando/Atualizando usuário admin@sigma.local...')
  const hash = await bcrypt.hash('Admin@2024!', 12)
  
  // Garante que o grupo default-group existe
  const group = await prisma.group.upsert({
    where: { id: 'default-group' },
    update: {},
    create: {
      id: 'default-group',
      name: 'NÚCLEO CENTRAL',
      description: 'Núcleo central de inteligência',
      color: '#6172f3',
      icon: 'Shield',
    },
  })

  const user = await prisma.user.upsert({
    where: { email: 'admin@sigma.local' },
    update: {
      passwordHash: hash,
      role: 'SUPER_ADMIN',
      groupId: group.id,
    },
    create: {
      name: 'Super Administrador Local',
      email: 'admin@sigma.local',
      passwordHash: hash,
      role: 'SUPER_ADMIN',
      groupId: group.id,
    },
  })
  
  console.log(`Usuário criado/atualizado com sucesso! ID: ${user.id} | Email: ${user.email} | Role: ${user.role}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
