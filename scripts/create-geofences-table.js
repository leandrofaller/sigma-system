const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Criando tabela geofences via SQL raw...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "geofences" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "coordinates" JSONB NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('✅ Tabela geofences criada com sucesso no banco de dados!');
  } catch (err) {
    console.error('❌ Erro ao criar tabela:', err.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
