import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadAnexoS3 } from '@/lib/s3'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File
  const descricao = (formData.get('descricao') as string) || null
  const tipoCompactacao =
    (formData.get('tipoCompactacao') as 'imagem' | 'documento' | 'auto') || 'auto'

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 })
  }

  if (file.size > 100 * 1024 * 1024) {
    // 100MB limit
    return NextResponse.json(
      { error: 'Arquivo muito grande (máx 100MB)' },
      { status: 413 }
    )
  }

  try {
    // Upload para S3
    const { urlS3, chaveS3, tamanho } = await uploadAnexoS3(
      file,
      params.id,
      tipoCompactacao
    )

    // Salvar metadados no banco
    const anexo = await prisma.aIPApenadoAnexo.create({
      data: {
        apenadoId: params.id,
        nomeOriginal: file.name,
        nomeS3: chaveS3.split('/').pop()!,
        tipoMime: file.type,
        tamanhoOriginal: file.size,
        tamanhoS3: tamanho,
        urlS3,
        chaveS3,
        descricao,
        usuarioUploadId: session.user.id,
      },
      include: {
        usuarioUpload: { select: { name: true } },
      },
    })

    return NextResponse.json({ anexo })
  } catch (erro) {
    console.error('Erro ao upload:', erro)
    return NextResponse.json({ error: 'Erro ao fazer upload' }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const anexos = await prisma.aIPApenadoAnexo.findMany({
    where: { apenadoId: params.id },
    include: { usuarioUpload: { select: { name: true } } },
    orderBy: { dataUpload: 'desc' },
  })

  return NextResponse.json({ anexos })
}
