import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { assertUploadAllowed } from '@/lib/security'
import sharp from 'sharp'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const

function uploadsBase() {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'ID do advogado é obrigatório' }, { status: 400 })
  }

  // Busca o advogado no banco para obter o sipeId
  const advogado = await prisma.sipeAdvogado.findUnique({
    where: { id },
  })

  if (!advogado) {
    return NextResponse.json({ error: 'Advogado não encontrado' }, { status: 404 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
    }

    const uploadError = assertUploadAllowed(file, {
      allowedExtensions: IMAGE_EXTENSIONS,
      allowedMimePrefixes: ['image/'],
    })
    if (uploadError) {
      return NextResponse.json({ error: uploadError }, { status: 400 })
    }

    // Processa a imagem usando o sharp (converter para WebP, redimensionar de forma inteligente para perfil)
    const inputBuffer = Buffer.from(await file.arrayBuffer())
    const webpBuffer = await sharp(inputBuffer)
      .resize(600, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer()

    const filename = `advogado-${advogado.sipeId}-manual.webp`
    const dir = join(uploadsBase(), 'advogados')

    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, filename), webpBuffer)

    const relativePhotoPath = `uploads/advogados/${filename}`

    // Atualiza o photoPath do advogado no banco de dados
    const updatedAdvogado = await prisma.sipeAdvogado.update({
      where: { id },
      data: {
        photoPath: relativePhotoPath,
      },
    })

    return NextResponse.json({
      message: 'Foto atualizada com sucesso',
      photoPath: updatedAdvogado.photoPath,
    }, { status: 200 })

  } catch (err: any) {
    console.error('[API UPLOAD ADVOGADO]', err)
    return NextResponse.json({ error: err?.message || 'Erro interno ao processar upload' }, { status: 500 })
  }
}
