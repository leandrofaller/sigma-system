import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== INSPEÇÃO DE APENADOS ESPECÍFICOS ===')
  
  const nomes = [
    'BRUNO FERNANDO RAMOS',
    'BIBIANA ATIARI MAGALHÃES LOPES',
    'BENIGNO CABRAL DA SILVA JUNIOR'
  ]
  
  for (const nome of nomes) {
    const apenados = await prisma.apenado.findMany({
      where: {
        name: {
          contains: nome,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        name: true,
        matricula: true,
        photoPath: true,
        faceDescriptor: true,
        detScore: true,
        photoQuality: true
      }
    })
    
    console.log(`\nBusca por: "${nome}" — Encontrados: ${apenados.length}`)
    for (const a of apenados) {
      console.log({
        id: a.id,
        nome: a.name,
        matricula: a.matricula,
        photoPath: a.photoPath,
        temEmbedding: a.faceDescriptor ? (a.faceDescriptor === 'NONE' ? 'NONE' : 'SIM (' + a.faceDescriptor.substring(0, 30) + '...)') : 'NULL',
        detScore: a.detScore,
        photoQuality: a.photoQuality
      })
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
