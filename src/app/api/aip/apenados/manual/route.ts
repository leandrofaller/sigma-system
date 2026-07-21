import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { syncMapaFromAipAsync } from '@/lib/mapa-faccoes-aip-sync'
import { getApenadosDir } from '@/lib/storage'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import sharp from 'sharp'

/**
 * POST /api/aip/apenados/manual
 * Cadastra uma pessoa manualmente na aba AIP (não vinculada inicialmente ao SIPE)
 * Suporta envio via FormData (com foto) ou JSON.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const cadastradoPor = (session.user as any).id

  try {
    let bodyData: Record<string, any> = {}
    let photoBuffer: Buffer | null = null

    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      formData.forEach((value, key) => {
        if (key === 'foto' && value instanceof File) {
          // foto enviada como arquivo
          photoBuffer = null // será lido abaixo
        } else {
          bodyData[key] = value.toString()
        }
      })

      const file = formData.get('foto') as File | null
      if (file && file.size > 0) {
        const arrayBuffer = await file.arrayBuffer()
        photoBuffer = Buffer.from(arrayBuffer)
      }
    } else {
      bodyData = await request.json()
      if (bodyData.fotoBase64) {
        const base64Data = bodyData.fotoBase64.includes(',')
          ? bodyData.fotoBase64.split(',')[1]
          : bodyData.fotoBase64
        photoBuffer = Buffer.from(base64Data, 'base64')
      }
    }

    const {
      nome,
      nomeOutro,
      vulgo,
      cpf,
      rg,
      rji,
      dataNascimento,
      sexo,
      nomeMae,
      nomePai,
      telefone,
      estadoCivil,
      unidade,
      situacao,
      facaoRealNome,
      facaoNivel,
      facaoRelevancia,
      logradouro,
      bairro,
      cidade,
      uf,
      notasInteligencia,
    } = bodyData

    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      return NextResponse.json(
        { success: false, message: 'O nome é obrigatório' },
        { status: 400 }
      )
    }

    const nomeUpper = nome.trim().toUpperCase()

    // 1. Processar Foto se fornecida
    let photoPath: string | null = null
    const apenadoTempId = `manual-${Date.now()}`

    if (photoBuffer) {
      try {
        const webpBuffer = await sharp(photoBuffer)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 90 })
          .toBuffer()

        const dir = getApenadosDir()
        await mkdir(dir, { recursive: true })
        const filename = `aip-${apenadoTempId}.webp`
        const localPath = join(dir, filename)
        await writeFile(localPath, webpBuffer)

        photoPath = `uploads/apenados/${filename}`
      } catch (imgErr) {
        console.error('[AIP MANUAL] Erro ao processar foto:', imgErr)
      }
    }

    // 2. Criar registro na tabela base 'apenados' para indexação ArcFace e busca por foto
    const apenadoLocal = await prisma.apenado.create({
      data: {
        name: nomeUpper,
        matricula: cpf || rji || rg || null,
        unidade: unidade || 'Fora do Sistema',
        faccao: facaoRealNome || null,
        photoPath,
        faceDescriptor: null, // ativa worker ArcFace para extrair vetor facial
      }
    })

    // 3. Gerar sipeId sintético negativo para garantir unicidade em AIPApenado
    const minSipeIdRecord = await prisma.aIPApenado.findFirst({
      where: { sipeId: { lt: 0 } },
      orderBy: { sipeId: 'asc' },
      select: { sipeId: true }
    })
    const syntheticSipeId = minSipeIdRecord ? minSipeIdRecord.sipeId - 1 : -1000000

    // 4. Criar registro em AIPApenado
    const novoAIPApenado = await prisma.aIPApenado.create({
      data: {
        sipeApenadoId: null, // Sem vínculo com SipeApenadoImportado inicial
        sipeId: syntheticSipeId,
        origemRegistro: 'MANUAL',
        apenadoLocalId: apenadoLocal.id,

        nome: nomeUpper,
        nomeOutro: nomeOutro || null,
        vulgo: vulgo ? vulgo.trim().toUpperCase() : null,
        cpf: cpf || null,
        rg: rg || null,
        rji: rji || null,
        dataNascimento: dataNascimento || null,
        sexo: sexo || null,
        nomeMae: nomeMae ? nomeMae.trim().toUpperCase() : null,
        nomePai: nomePai ? nomePai.trim().toUpperCase() : null,
        telefone: telefone || null,
        estadoCivil: estadoCivil || null,

        unidade: unidade || 'Fora do Sistema',
        situacao: situacao || 'Em Liberdade',

        facaoRealNome: facaoRealNome || null,
        facaoNivel: facaoNivel || null,
        facaoRelevancia: facaoRelevancia || null,

        logradouro: logradouro || null,
        bairro: bairro || null,
        cidade: cidade || null,
        uf: uf || null,

        photoPath,
        notasInteligencia: notasInteligencia || null,
        cadastradoPor
      }
    })

    // Sincronizar mapa de facções de inteligência de forma assíncrona
    syncMapaFromAipAsync(novoAIPApenado.id, cadastradoPor)

    console.log(`[AIP MANUAL] ✅ Cadastro manual criado com sucesso: ${novoAIPApenado.nome} (ID: ${novoAIPApenado.id})`)

    return NextResponse.json(
      {
        success: true,
        apenado: novoAIPApenado,
        message: 'Pessoa cadastrada com sucesso na aba AIP'
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('[AIP MANUAL] ❌ Erro ao cadastrar pessoa manualmente:', error)
    return NextResponse.json(
      { success: false, message: `Erro ao realizar cadastro manual: ${error?.message || error}` },
      { status: 500 }
    )
  }
}
