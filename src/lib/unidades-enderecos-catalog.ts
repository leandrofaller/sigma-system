import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import {
  UNIDADES_ENDERECOS_RO,
  COMARCAS_RO,
  type UnidadeEndereco,
} from '@/lib/unidades-enderecos-ro'

export const CUSTOM_UNIDADE_PREFIX = 'custom-'

export function isCustomUnidadeId(unidadeId: string): boolean {
  return unidadeId.startsWith(CUSTOM_UNIDADE_PREFIX)
}

function generateCustomId(): string {
  return `${CUSTOM_UNIDADE_PREFIX}${randomUUID()}`
}

type CustomRow = {
  id: string
  comarca: string
  unidade: string
  endereco: string
  cep: string
  latitude: number | null
  longitude: number | null
  status: 'PENDENTE' | 'ATIVA' | 'REJEITADA'
}

function mapCustomRow(row: CustomRow): UnidadeEndereco {
  return {
    id: row.id,
    comarca: row.comarca,
    unidade: row.unidade,
    endereco: row.endereco,
    cep: row.cep,
    latitude: row.latitude,
    longitude: row.longitude,
    criadaNoSistema: true,
    customizado: true,
    alteracaoPendente: row.status === 'PENDENTE',
  }
}

export interface UnidadeEnderecoInput {
  comarca: string
  unidade: string
  endereco: string
  cep?: string
  latitude?: number | null
  longitude?: number | null
}

export function isAdminRole(role?: string | null): boolean {
  return !!role && ['SUPER_ADMIN', 'ADMIN'].includes(role)
}

export function normalizeUnidadeInput(raw: UnidadeEnderecoInput): UnidadeEnderecoInput {
  const lat = raw.latitude
  const lng = raw.longitude
  const hasLat = lat != null && !isNaN(lat)
  const hasLng = lng != null && !isNaN(lng)

  return {
    comarca: raw.comarca.trim(),
    unidade: raw.unidade.trim(),
    endereco: raw.endereco.trim(),
    cep: (raw.cep ?? '').trim(),
    latitude: hasLat && hasLng ? lat : null,
    longitude: hasLat && hasLng ? lng : null,
  }
}

export function validateUnidadeInput(data: UnidadeEnderecoInput): string | null {
  if (!data.comarca) return 'Comarca é obrigatória'
  if (!data.unidade) return 'Nome da unidade é obrigatório'
  if (!data.endereco) return 'Endereço é obrigatório'
  if (data.latitude != null && (data.latitude < -90 || data.latitude > 90)) {
    return 'Latitude inválida'
  }
  if (data.longitude != null && (data.longitude < -180 || data.longitude > 180)) {
    return 'Longitude inválida'
  }
  const hasLat = data.latitude != null
  const hasLng = data.longitude != null
  if (hasLat !== hasLng) return 'Informe latitude e longitude juntas, ou deixe ambas vazias'
  return null
}

function mergeEntry(
  base: UnidadeEndereco,
  override?: {
    comarca: string
    unidade: string
    endereco: string
    cep: string
    latitude: number | null
    longitude: number | null
  } | null,
  alteracaoPendente = false
): UnidadeEndereco {
  if (!override) {
    return alteracaoPendente ? { ...base, alteracaoPendente: true } : base
  }
  return {
    id: base.id,
    comarca: override.comarca,
    unidade: override.unidade,
    endereco: override.endereco,
    cep: override.cep,
    latitude: override.latitude,
    longitude: override.longitude,
    customizado: true,
    alteracaoPendente,
  }
}

export function getStaticUnidadeById(unidadeId: string): UnidadeEndereco | undefined {
  return UNIDADES_ENDERECOS_RO.find((u) => u.id === unidadeId)
}

export async function loadCustomUnidadesAtivas(): Promise<UnidadeEndereco[]> {
  const rows = await prisma.unidadeEnderecoCustom.findMany({
    where: { status: 'ATIVA' },
    orderBy: [{ comarca: 'asc' }, { unidade: 'asc' }],
  })
  return rows.map(mapCustomRow)
}

export async function loadUnidadesCatalog(): Promise<UnidadeEndereco[]> {
  const [overrides, pendentes, customAtivas] = await Promise.all([
    prisma.unidadeEnderecoOverride.findMany(),
    prisma.unidadeEnderecoSolicitacao.findMany({
      where: { status: 'PENDENTE' },
      select: { unidadeId: true },
    }),
    prisma.unidadeEnderecoCustom.findMany({
      where: { status: 'ATIVA' },
      orderBy: [{ comarca: 'asc' }, { unidade: 'asc' }],
    }),
  ])

  const overrideMap = new Map(overrides.map((o) => [o.unidadeId, o]))
  const pendenteIds = new Set(pendentes.map((p) => p.unidadeId))

  const estaticas = UNIDADES_ENDERECOS_RO.map((base) =>
    mergeEntry(base, overrideMap.get(base.id) ?? null, pendenteIds.has(base.id))
  )
  const customizadas = customAtivas.map(mapCustomRow)

  return [...estaticas, ...customizadas]
}

export async function loadUnidadeById(unidadeId: string): Promise<UnidadeEndereco | null> {
  if (isCustomUnidadeId(unidadeId)) {
    const row = await prisma.unidadeEnderecoCustom.findUnique({ where: { id: unidadeId } })
    if (!row || row.status === 'REJEITADA') return null
    return mapCustomRow(row)
  }

  const base = getStaticUnidadeById(unidadeId)
  if (!base) return null

  const [override, pendente] = await Promise.all([
    prisma.unidadeEnderecoOverride.findUnique({ where: { unidadeId } }),
    prisma.unidadeEnderecoSolicitacao.findFirst({
      where: { unidadeId, status: 'PENDENTE' },
      select: { id: true },
    }),
  ])

  return mergeEntry(base, override, !!pendente)
}

export async function criarUnidade(
  data: UnidadeEnderecoInput,
  userId: string,
  asAdmin: boolean
): Promise<UnidadeEndereco> {
  const normalized = normalizeUnidadeInput(data)
  const err = validateUnidadeInput(normalized)
  if (err) throw new Error(err)

  const id = generateCustomId()
  const row = await prisma.unidadeEnderecoCustom.create({
    data: {
      id,
      comarca: normalized.comarca,
      unidade: normalized.unidade,
      endereco: normalized.endereco,
      cep: normalized.cep ?? '',
      latitude: normalized.latitude ?? null,
      longitude: normalized.longitude ?? null,
      status: asAdmin ? 'ATIVA' : 'PENDENTE',
      criadoPorId: userId,
      revisadoPorId: asAdmin ? userId : null,
      revisadoEm: asAdmin ? new Date() : null,
    },
  })

  return mapCustomRow(row)
}

export async function atualizarUnidadeCustom(
  unidadeId: string,
  data: UnidadeEnderecoInput,
  userId: string
) {
  const normalized = normalizeUnidadeInput(data)
  const err = validateUnidadeInput(normalized)
  if (err) throw new Error(err)
  if (!isCustomUnidadeId(unidadeId)) throw new Error('UNIDADE_NAO_CUSTOM')

  const existing = await prisma.unidadeEnderecoCustom.findUnique({ where: { id: unidadeId } })
  if (!existing || existing.status !== 'ATIVA') throw new Error('UNIDADE_NAO_ENCONTRADA')

  const row = await prisma.unidadeEnderecoCustom.update({
    where: { id: unidadeId },
    data: {
      comarca: normalized.comarca,
      unidade: normalized.unidade,
      endereco: normalized.endereco,
      cep: normalized.cep ?? '',
      latitude: normalized.latitude ?? null,
      longitude: normalized.longitude ?? null,
    },
  })

  return mapCustomRow(row)
}

export async function upsertUnidadeOverride(
  unidadeId: string,
  data: UnidadeEnderecoInput,
  userId: string
) {
  const normalized = normalizeUnidadeInput(data)
  const err = validateUnidadeInput(normalized)
  if (err) throw new Error(err)
  if (!getStaticUnidadeById(unidadeId)) throw new Error('UNIDADE_NAO_ENCONTRADA')

  return prisma.unidadeEnderecoOverride.upsert({
    where: { unidadeId },
    create: {
      unidadeId,
      comarca: normalized.comarca,
      unidade: normalized.unidade,
      endereco: normalized.endereco,
      cep: normalized.cep ?? '',
      latitude: normalized.latitude ?? null,
      longitude: normalized.longitude ?? null,
      atualizadoPorId: userId,
    },
    update: {
      comarca: normalized.comarca,
      unidade: normalized.unidade,
      endereco: normalized.endereco,
      cep: normalized.cep ?? '',
      latitude: normalized.latitude ?? null,
      longitude: normalized.longitude ?? null,
      atualizadoPorId: userId,
    },
  })
}

export async function criarSolicitacaoAlteracao(
  unidadeId: string,
  data: UnidadeEnderecoInput,
  userId: string
) {
  const normalized = normalizeUnidadeInput(data)
  const err = validateUnidadeInput(normalized)
  if (err) throw new Error(err)
  if (!getStaticUnidadeById(unidadeId)) throw new Error('UNIDADE_NAO_ENCONTRADA')

  await prisma.unidadeEnderecoSolicitacao.updateMany({
    where: { unidadeId, status: 'PENDENTE' },
    data: {
      status: 'REJEITADA',
      revisadoEm: new Date(),
      motivoRejeicao: 'Substituída por nova solicitação',
    },
  })

  return prisma.unidadeEnderecoSolicitacao.create({
    data: {
      unidadeId,
      comarca: normalized.comarca,
      unidade: normalized.unidade,
      endereco: normalized.endereco,
      cep: normalized.cep ?? '',
      latitude: normalized.latitude ?? null,
      longitude: normalized.longitude ?? null,
      solicitadoPorId: userId,
    },
  })
}

export async function aprovarSolicitacao(solicitacaoId: string, adminId: string) {
  const sol = await prisma.unidadeEnderecoSolicitacao.findUnique({ where: { id: solicitacaoId } })
  if (!sol) throw new Error('SOLICITACAO_NAO_ENCONTRADA')
  if (sol.status !== 'PENDENTE') throw new Error('SOLICITACAO_JA_REVISADA')

  await prisma.$transaction([
    prisma.unidadeEnderecoOverride.upsert({
      where: { unidadeId: sol.unidadeId },
      create: {
        unidadeId: sol.unidadeId,
        comarca: sol.comarca,
        unidade: sol.unidade,
        endereco: sol.endereco,
        cep: sol.cep,
        latitude: sol.latitude,
        longitude: sol.longitude,
        atualizadoPorId: adminId,
      },
      update: {
        comarca: sol.comarca,
        unidade: sol.unidade,
        endereco: sol.endereco,
        cep: sol.cep,
        latitude: sol.latitude,
        longitude: sol.longitude,
        atualizadoPorId: adminId,
      },
    }),
    prisma.unidadeEnderecoSolicitacao.update({
      where: { id: solicitacaoId },
      data: {
        status: 'APROVADA',
        revisadoPorId: adminId,
        revisadoEm: new Date(),
      },
    }),
  ])

  return sol
}

export async function rejeitarSolicitacao(solicitacaoId: string, adminId: string, motivo?: string) {
  const sol = await prisma.unidadeEnderecoSolicitacao.findUnique({ where: { id: solicitacaoId } })
  if (!sol) throw new Error('SOLICITACAO_NAO_ENCONTRADA')
  if (sol.status !== 'PENDENTE') throw new Error('SOLICITACAO_JA_REVISADA')

  return prisma.unidadeEnderecoSolicitacao.update({
    where: { id: solicitacaoId },
    data: {
      status: 'REJEITADA',
      revisadoPorId: adminId,
      revisadoEm: new Date(),
      motivoRejeicao: motivo?.trim() || null,
    },
  })
}

export async function listarSolicitacoesPendentes() {
  return prisma.unidadeEnderecoSolicitacao.findMany({
    where: { status: 'PENDENTE' },
    orderBy: { solicitadoEm: 'asc' },
    include: {
      solicitadoPor: { select: { id: true, name: true, email: true } },
    },
  })
}

export async function listarNovasUnidadesPendentes() {
  return prisma.unidadeEnderecoCustom.findMany({
    where: { status: 'PENDENTE' },
    orderBy: { criadoEm: 'asc' },
    include: {
      criadoPor: { select: { id: true, name: true, email: true } },
    },
  })
}

export async function aprovarNovaUnidade(customId: string, adminId: string) {
  const row = await prisma.unidadeEnderecoCustom.findUnique({ where: { id: customId } })
  if (!row) throw new Error('NOVA_UNIDADE_NAO_ENCONTRADA')
  if (row.status !== 'PENDENTE') throw new Error('NOVA_UNIDADE_JA_REVISADA')

  const updated = await prisma.unidadeEnderecoCustom.update({
    where: { id: customId },
    data: {
      status: 'ATIVA',
      revisadoPorId: adminId,
      revisadoEm: new Date(),
    },
  })

  return mapCustomRow(updated)
}

export async function rejeitarNovaUnidade(customId: string, adminId: string, motivo?: string) {
  const row = await prisma.unidadeEnderecoCustom.findUnique({ where: { id: customId } })
  if (!row) throw new Error('NOVA_UNIDADE_NAO_ENCONTRADA')
  if (row.status !== 'PENDENTE') throw new Error('NOVA_UNIDADE_JA_REVISADA')

  return prisma.unidadeEnderecoCustom.update({
    where: { id: customId },
    data: {
      status: 'REJEITADA',
      revisadoPorId: adminId,
      revisadoEm: new Date(),
      motivoRejeicao: motivo?.trim() || null,
    },
  })
}

export function listComarcasFromCatalog(unidades: UnidadeEndereco[]): string[] {
  const fromData = [...new Set(unidades.map((u) => u.comarca))]
  const merged = [...new Set([...COMARCAS_RO, ...fromData])]
  return merged.sort()
}