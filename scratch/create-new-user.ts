import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Uso: npx tsx scratch/create-new-user.ts <nome> <email> <senha> [role]');
    console.log('Valores de role permitidos: SUPER_ADMIN, ADMIN, OPERATOR (Padrão: OPERATOR)');
    process.exit(1);
  }

  const name = args[0];
  const email = args[1];
  const password = args[2];
  let roleInput = args[3] || 'OPERATOR';

  // Validar role
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(roleInput)) {
    console.error(`Erro: Role inválida "${roleInput}". Use SUPER_ADMIN, ADMIN ou OPERATOR.`);
    process.exit(1);
  }

  const role = roleInput as UserRole;

  console.log(`Criando usuário:`);
  console.log(`- Nome: ${name}`);
  console.log(`- E-mail: ${email}`);
  console.log(`- Role: ${role}`);

  // Verificar se o usuário já existe
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    console.error(`Erro: Já existe um usuário com o e-mail "${email}".`);
    process.exit(1);
  }

  // Tentar encontrar um grupo padrão para associar
  const defaultGroup = await prisma.group.findFirst({
    where: { id: 'default-group' }
  });

  const groupId = defaultGroup ? defaultGroup.id : null;

  // Criptografar a senha
  const hash = await bcrypt.hash(password, 12);

  // Criar o usuário
  const newUser = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: hash,
      role,
      groupId,
      isActive: true,
    }
  });

  console.log(`✅ Usuário criado com sucesso!`);
  console.log(`ID: ${newUser.id}`);
}

main()
  .catch((e) => {
    console.error('Erro ao criar usuário:', e);
  })
  .finally(() => prisma.$disconnect());
