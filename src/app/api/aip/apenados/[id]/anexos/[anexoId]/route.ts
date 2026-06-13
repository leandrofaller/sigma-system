import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteAnexoS3 } from '@/lib/s3'

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
