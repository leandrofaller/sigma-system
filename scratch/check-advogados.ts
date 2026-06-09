import { prisma } from '../src/lib/db'

async function main() {
  try {
    const fs = require('fs')
    const path = require('path')
    const advs = await prisma.sipeAdvogado.findMany({
      where: {
        nome: {
          contains: 'Abdiel',
          mode: 'insensitive'
        }
      }
    })
    console.log('Resultados para Abdiel:')
    for (const adv of advs) {
      console.log(`ID: ${adv.id}, SipeId: ${adv.sipeId}, Nome: ${adv.nome}, OAB: ${adv.oab}, PhotoPath: ${adv.photoPath}`)
      if (adv.photoPath) {
        const fullPath = path.resolve(path.join(process.cwd(), adv.photoPath))
        const exists = fs.existsSync(fullPath)
        console.log(`  Caminho local completo: ${fullPath}`)
        console.log(`  Arquivo existe localmente? ${exists}`)
        if (exists) {
          console.log(`  Tamanho do arquivo: ${fs.statSync(fullPath).size} bytes`)
        }
      }
    }
  } catch (e) {
    console.error('Erro:', e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
