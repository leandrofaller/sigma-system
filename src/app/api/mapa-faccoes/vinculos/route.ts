import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unaccentParam } from '@/lib/search'
import { nomeParaIbge } from '@/lib/municipios-rondonia'
import {
  fetchMapaVinculosComAip,
  formatVinculo,
  normalizeMunicipioInput,
  resolveAipApenadoId,
} from '@/lib/mapa-faccoes-service'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const municipio = unaccentParam(new URL(request.url).searchParams.get('municipio'))
  const unidade = unaccentParam(new URL(request.url).searchParams.get('unidade'))

  try {
    let vinculos = await fetchMapaVinculosComAip()

    if (municipio) {
      const pattern = municipio.toLowerCase()
      vinculos = vinculos.filter((v) => v.municipio.toLowerCase().includes(pattern))
    }
    if (unidade) {
      const pattern = unidade.toLowerCase()
      vinculos = vinculos.filter((v) => v.unidadePrisional.toLowerCase().includes(pattern))
    }

    return NextResponse.json({ vinculos: vinculos.map(formatVinculo) })
  } catch (e) {
    console.error('[mapa-faccoes/vinculos GET]', e)
    return NextResponse.json({ error: 'Erro ao listar vínculos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { municipio, municipioIbge, unidadePrisional, aipApenadoId, sipeId, observacoes } = body
    const cadastradoPor = (session.user as { id: string }).id

    if (!municipio?.trim()) {
      return NextResponse.json({ error: 'Município é obrigatório' }, { status: 400 })
    }
    if (!unidadePrisional?.trim()) {
      return NextResponse.json({ error: 'Unidade prisional é obrigatória' }, { status: 400 })
    }
    if (!aipApenadoId && !sipeId) {
      return NextResponse.json({ error: 'Informe aipApenadoId ou sipeId' }, { status: 400 })
    }

    const { aipApenadoId: resolvedId, created } = await resolveAipApenadoId(
      { aipApenadoId, sipeId: sipeId ? Number(sipeId) : undefined },
      cadastradoPor
    )

    const ibgeResolved =
      municipioIbge != null ? Number(municipioIbge) : nomeParaIbge(municipio)
    const { municipio: mun, municipioIbge: ibge } = normalizeMunicipioInput(
      municipio,
      ibgeResolved
    )

    const existente = await prisma.mapaFaccaoVinculo.findUnique({
      where: {
        aipApenadoId_municipio_unidadePrisional: {
          aipApenadoId: resolvedId,
          municipio: mun,
          unidadePrisional: unidadePrisional.trim(),
        },
      },
    })

    if (existente) {
      return NextResponse.json(
        {
          error: 'Vínculo já cadastrado para este apenado, município e unidade',
          vinculoId: existente.id,
          duplicate: true,
        },
        { status: 409 }
      )
    }

    const vinculo = await prisma.mapaFaccaoVinculo.create({
      data: {
        municipio: mun,
        municipioIbge: ibge,
        unidadePrisional: unidadePrisional.trim(),
        aipApenadoId: resolvedId,
        observacoes: observacoes?.trim() || null,
        cadastradoPor,
      },
      include: {
        aipApenado: {
          select: {
            id: true,
            sipeId: true,
            nome: true,
            unidade: true,
            faccao: true,
            facaoRealNome: true,
            facaoNivel: true,
            vulgo: true,
            photoPath: true,
          },
        },
      },
    })

    return NextResponse.json(
      {
        success: true,
        createdAip: created,
        vinculo: formatVinculo(vinculo),
      },
      { status: 201 }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'ERRO'
    if (msg === 'APENADO_SIPE_NAO_ENCONTRADO') {
      return NextResponse.json({ error: 'Apenado não encontrado no SIPE/SIAIP' }, { status: 404 })
    }
    if (msg === 'APENADO_AIP_NAO_ENCONTRADO') {
      return NextResponse.json({ error: 'Apenado AIP não encontrado' }, { status: 404 })
    }
    console.error('[mapa-faccoes/vinculos POST]', e)
    return NextResponse.json({ error: 'Erro ao cadastrar vínculo' }, { status: 500 })
  }
}