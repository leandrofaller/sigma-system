import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Criar grupo padrão
  const defaultGroup = await prisma.group.upsert({
    where: { id: 'default-group' },
    update: {},
    create: {
      id: 'default-group',
      name: 'NÚCLEO CENTRAL',
      description: 'Núcleo central de inteligência',
      color: '#6172f3',
      icon: 'Shield',
    },
  });

  // Criar super administrador
  const hash = await bcrypt.hash('Admin@2024!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@sigma.local' },
    update: {},
    create: {
      name: 'Super Administrador',
      email: 'admin@sigma.local',
      passwordHash: hash,
      role: 'SUPER_ADMIN',
      groupId: defaultGroup.id,
    },
  });

  // Template padrão de RELINT
  await prisma.relintTemplate.upsert({
    where: { id: 'default-template' },
    update: {},
    create: {
      id: 'default-template',
      name: 'RELINT Padrão',
      description: 'Template padrão para relatórios de inteligência',
      isDefault: true,
      createdBy: 'system',
      fields: {
        number: { label: 'Número', type: 'text', required: true },
        date: { label: 'Data', type: 'date', required: true },
        subject: { label: 'Assunto', type: 'text', required: true },
        diffusion: { label: 'Difusão', type: 'text', required: true },
        classification: { label: 'Classificação', type: 'select', required: true },
        introduction: { label: 'Introdução', type: 'textarea', required: true },
        body: { label: 'Corpo do Relatório', type: 'richtext', required: true },
        conclusion: { label: 'Conclusão', type: 'textarea', required: false },
        recommendations: { label: 'Recomendações', type: 'textarea', required: false },
      },
      layout: {
        showLogo: true,
        showHeader: true,
        showFooter: true,
        showClassification: true,
        showPageNumber: true,
        orientation: 'portrait',
        fontSize: 12,
        fontFamily: 'Arial',
      },
    },
  });

  // Configs do sistema
  const configs = [
    { key: 'ai_provider', value: { provider: 'openai', model: 'gpt-4o' }, description: 'Provedor de IA padrão' },
    { key: 'system_theme', value: { mode: 'cover', coverName: 'LogiTrack Express' }, description: 'Tema do sistema' },
    { key: 'backup_enabled', value: { enabled: false }, description: 'Backup automático no Google Drive' },
    { key: 'geolocation_enabled', value: { enabled: true }, description: 'Rastreamento de geolocalização' },
    { key: 'chat_enabled', value: { enabled: true }, description: 'Chat interno' },
    { key: 'max_upload_size', value: { mb: 50 }, description: 'Tamanho máximo de upload em MB' },
    { key: 'relint_prefix', value: { prefix: 'RELINT' }, description: 'Prefixo dos relatórios' },
    { key: 'organization_name', value: { name: 'AGÊNCIA DE INTELIGÊNCIA' }, description: 'Nome da organização' },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }

  console.log('✅ Seed concluído!');
  console.log('📧 Login: admin@sigma.local');
  console.log('🔑 Senha: Admin@2024!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
