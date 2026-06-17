import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import { createHash } from 'crypto'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import { getApenadoPhotoPath } from '../src/lib/storage'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log('=== INICIANDO LIMPEZA DE FOTOS DUPLICADAS ===')

  // 1. Buscar todas as fotos complementares
  const fotos = await prisma.sipeFotoComplementar.findMany({
    orderBy: { createdAt: 'asc' }
  })

  console.log(`Total de fotos complementares registradas no banco: ${fotos.length}`)

  // Agrupar por apenadoImportadoId
  const apenadoMap = new Map<string, typeof fotos>()
  for (const f of fotos) {
    if (!apenadoMap.has(f.apenadoImportadoId)) {
      apenadoMap.set(f.apenadoImportadoId, [])
    }
    apenadoMap.get(f.apenadoImportadoId)!.push(f)
  }

  let totalDeletadas = 0
  let totalDeletadasPrincipal = 0

  for (const [apenadoImportadoId, fotosApenado] of apenadoMap.entries()) {
    // Buscar sipeId e foto principal do apenado
    const importado = await prisma.sipeApenadoImportado.findUnique({
      where: { id: apenadoImportadoId },
      select: { sipeId: true, photoPath: true, nome: true }
    })

    if (!importado) continue

    // Obter hash da foto principal
    let mainPhotoHash: string | null = null
    if (importado.photoPath) {
      const mainPhotoPathAbs = getApenadoPhotoPath(importado.photoPath)
      if (existsSync(mainPhotoPathAbs)) {
        try {
          const mainBuffer = await fs.readFile(mainPhotoPathAbs)
          mainPhotoHash = createHash('sha256').update(mainBuffer).digest('hex')
        } catch {}
      }
    }

    const seenHashes = new Set<string>()

    for (const fotoComp of fotosApenado) {
      const pathAbs = getApenadoPhotoPath(fotoComp.photoPath)
      if (!existsSync(pathAbs)) {
        // Se a foto não existe fisicamente, removemos o registro órfão do banco
        console.log(`[${importado.sipeId}] ${importado.nome}: Foto órfã no disco deletada do banco (${fotoComp.photoPath})`)
        await prisma.sipeFotoComplementar.delete({ where: { id: fotoComp.id } })
        totalDeletadas++
        continue
      }

      try {
        const buffer = await fs.readFile(pathAbs)
        const fileHash = createHash('sha256').update(buffer).digest('hex')

        // 1. Verificar se é igual à foto principal
        if (mainPhotoHash && fileHash === mainPhotoHash) {
          console.log(`[${importado.sipeId}] ${importado.nome}: Foto complementar removida por ser idêntica à foto principal (${fotoComp.photoPath})`)
          
          // Deleta do banco
          await prisma.sipeFotoComplementar.delete({ where: { id: fotoComp.id } })
          // Deleta do disco
          await fs.unlink(pathAbs).catch(() => {})
          
          totalDeletadasPrincipal++
          totalDeletadas++
          continue
        }

        // 2. Verificar se já vimos este hash de complementar para este apenado
        if (seenHashes.has(fileHash)) {
          console.log(`[${importado.sipeId}] ${importado.nome}: Foto complementar duplicada de outra complementar removida (${fotoComp.photoPath})`)
          
          // Deleta do banco
          await prisma.sipeFotoComplementar.delete({ where: { id: fotoComp.id } })
          // Deleta do disco
          await fs.unlink(pathAbs).catch(() => {})
          
          totalDeletadas++
        } else {
          seenHashes.add(fileHash)
        }
      } catch (err: any) {
        console.error(`Erro ao processar foto complementar ${fotoComp.photoPath}:`, err?.message)
      }
    }
  }

  console.log(`\n=== LIMPEZA DE FOTOS CONCLUÍDA ===`)
  console.log(`Total de fotos duplicadas deletadas: ${totalDeletadas}`)
  console.log(`Destas, fotos idênticas à principal: ${totalDeletadasPrincipal}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
