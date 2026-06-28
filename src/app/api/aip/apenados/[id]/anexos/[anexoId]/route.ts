import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteAnexoS3, getAnexoPresignedUrl } from '@/lib/s3'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; anexoId: string }> }
) {
  const { id, anexoId } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const anexo = await prisma.aIPApenadoAnexo.findUnique({
    where: { id: anexoId },
  })

  if (!anexo) {
    return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 })
  }

  if (anexo.apenadoId !== id) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const download = searchParams.get('download') === 'true'

  try {
    // Para download, redireciona com Content-Disposition attachment
    if (download) {
      const presignedUrl = await getAnexoPresignedUrl(
        anexo.chaveS3,
        anexo.nomeOriginal
      )
      return NextResponse.redirect(presignedUrl, { status: 307 })
    }

    // Para visualização (img src, lightbox), redireciona para a URL assinada do S3 (permitindo exibição inline)
    const presignedUrl = await getAnexoPresignedUrl(anexo.chaveS3)
    return NextResponse.redirect(presignedUrl, { status: 307 })
  } catch (erro) {
    console.error('Erro ao obter anexo do S3:', erro)
    return NextResponse.json({ error: 'Erro ao carregar anexo' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; anexoId: string }> }
) {
  const { id, anexoId } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const anexo = await prisma.aIPApenadoAnexo.findUnique({
    where: { id: anexoId },
  })

  if (!anexo) {
    return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 })
  }

  if (anexo.apenadoId !== id) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    // Deletar do S3
    await deleteAnexoS3(anexo.chaveS3)

    // Deletar do banco
    await prisma.aIPApenadoAnexo.delete({
      where: { id: anexoId },
    })

    return NextResponse.json({ ok: true })
  } catch (erro) {
    console.error('Erro ao deletar:', erro)
    return NextResponse.json({ error: 'Erro ao deletar anexo' }, { status: 500 })
  }
}
