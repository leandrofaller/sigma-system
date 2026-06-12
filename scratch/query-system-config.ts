import { prisma } from '../src/lib/db'

async function main() {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'sipe_unidades' }
    })
    if (config) {
      console.log('Unidades cadastradas no SystemConfig:')
      console.log(JSON.stringify(config.value, null, 2))
    } else {
      console.log('Chave sipe_unidades não encontrada no SystemConfig.')
    }
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
