import { prisma } from '../src/lib/db.js'

async function query() {
  const apenados = await prisma.sipeApenadoImportado.findMany({
    take: 5,
    select: { sipeId: true, nome: true, unidade: true }
  })
  console.log('Apenados locais:', apenados)

  // Lista os jobs para ver a unidade
  const jobs = await prisma.sipeSyncJob.findMany({
    take: 5,
    select: { id: true, unidadeNome: true, tipo: true }
  })
  console.log('Jobs de Sync:', jobs)
  
  // Lista as configurações de unidades se existirem
  const config = await prisma.systemConfig.findUnique({
    where: { key: 'sipe_unidades' }
  })
  if (config) {
    const unidades = config.value as Array<{ id: string; nome: string }>
    const novaMamore = unidades.find(u => u.nome.toUpperCase().includes('MAMORÉ') || u.nome.toUpperCase().includes('MAMORE'))
    console.log('Unidade Nova Mamoré no config:', novaMamore)
  }
}

query().catch(console.error)
