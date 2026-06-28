import { prisma } from '@/lib/db'
import { agregarPorMunicipio, faccaoCor, faccaoDisplay } from '@/lib/mapa-faccoes'
import { normalizeMunicipioNome, nomeParaIbge } from '@/lib/municipios-rondonia'

export async function resolveAipApenadoId(
  opts: { aipApenadoId?: string; sipeId?: number },
  cadastradoPor: string
): Promise<{ aipApenadoId: string; created: boolean }> {
  if (opts.aipApenadoId) {
    const exists = await prisma.aIPApenado.findUnique({ where: { id: opts.aipApenadoId } })
    if (!exists) throw new Error('APENADO_AIP_NAO_ENCONTRADO')
    return { aipApenadoId: opts.aipApenadoId, created: false }
  }

  if (!opts.sipeId) throw new Error('SIPE_ID_OBRIGATORIO')

  const emAip = await prisma.aIPApenado.findUnique({ where: { sipeId: opts.sipeId } })
  if (emAip) return { aipApenadoId: emAip.id, created: false }

  const sipeApenado = await prisma.sipeApenadoImportado.findUnique({
    where: { sipeId: opts.sipeId },
    include: { faccao: true },
  })
  if (!sipeApenado) throw new Error('APENADO_SIPE_NAO_ENCONTRADO')

  const novo = await prisma.aIPApenado.create({
    data: {
      sipeApenadoId: sipeApenado.sipeId,
      sipeId: sipeApenado.sipeId,
      nome: sipeApenado.nome,
      nomeOutro: sipeApenado.nomeOutro,
      cpf: sipeApenado.cpf,
      rg: sipeApenado.rg,
      rgOrgao: sipeApenado.rgOrgao,
      dataNascimento: sipeApenado.dataNascimento,
      sexo: sipeApenado.sexo,
      etnia: sipeApenado.etnia,
      naturalidade: sipeApenado.naturalidade,
      orientacaoSexual: sipeApenado.orientacaoSexual,
      tipoSanguineo: sipeApenado.tipoSanguineo,
      grauInstrucao: sipeApenado.grauInstrucao,
      religiao: sipeApenado.religiao,
      estadoCivil: sipeApenado.estadoCivil,
      nomeConjuge: sipeApenado.nomeConjuge,
      qtdFilhos: sipeApenado.qtdFilhos,
      nomeMae: sipeApenado.nomeMae,
      nomePai: sipeApenado.nomePai,
      telefone: sipeApenado.telefone,
      rji: sipeApenado.rji,
      unidade: sipeApenado.unidade,
      cela: sipeApenado.cela,
      regime: sipeApenado.regime,
      situacao: sipeApenado.situacao,
      dataEntrada: sipeApenado.dataEntrada,
      dataPrisao: sipeApenado.dataPrisao,
      tempoPena: sipeApenado.tempoPena,
      faccao: sipeApenado.faccao ? sipeApenado.faccao.nome : null,
      monitorado: sipeApenado.monitorado,
      intramuro: sipeApenado.intramuro,
      presoOriundo: sipeApenado.presoOriundo,
      oficioEntrada: sipeApenado.oficioEntrada,
      celeAtual: sipeApenado.celeAtual,
      ultimaMovimentacao: sipeApenado.ultimaMovimentacao,
      logradouro: sipeApenado.logradouro,
      numero: sipeApenado.numero,
      complemento: sipeApenado.complemento,
      bairro: sipeApenado.bairro,
      cidade: sipeApenado.cidade,
      uf: sipeApenado.uf,
      cep: sipeApenado.cep,
      photoPath: sipeApenado.photoPath,
      ultimaSincAt: new Date(),
      cadastradoPor,
    },
  })

  return { aipApenadoId: novo.id, created: true }
}

export async function fetchMapaVinculosComAip() {
  return prisma.mapaFaccaoVinculo.findMany({
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
    orderBy: [{ municipio: 'asc' }, { unidadePrisional: 'asc' }],
  })
}

export async function buildMapaStats() {
  const vinculos = await fetchMapaVinculosComAip()
  const municipios = agregarPorMunicipio(vinculos, (nome, ibge) => ibge ?? nomeParaIbge(nome))
  const maxApenados = municipios.reduce((m, x) => Math.max(m, x.totalApenados), 0)

  const porUnidade = new Map<
    string,
    { unidade: string; municipio: string; total: number; faccoes: Record<string, number> }
  >()

  for (const v of vinculos) {
    const key = `${v.unidadePrisional}::${v.municipio}`
    let u = porUnidade.get(key)
    if (!u) {
      u = { unidade: v.unidadePrisional, municipio: v.municipio, total: 0, faccoes: {} }
      porUnidade.set(key, u)
    }
    u.total++
    const f = faccaoDisplay(v.aipApenado)
    u.faccoes[f] = (u.faccoes[f] || 0) + 1
  }

  const unidades = Array.from(porUnidade.values())
    .map((u) => {
      let pred = 'Não identificado'
      let max = 0
      for (const [f, c] of Object.entries(u.faccoes)) {
        if (c > max) {
          max = c
          pred = f
        }
      }
      return { ...u, faccaoPredominante: pred, faccaoCor: faccaoCor(pred) }
    })
    .sort((a, b) => b.total - a.total)

  const faccoesGlobais: Record<string, number> = {}
  for (const v of vinculos) {
    const f = faccaoDisplay(v.aipApenado)
    faccoesGlobais[f] = (faccoesGlobais[f] || 0) + 1
  }

  return {
    municipios,
    maxApenados,
    unidades,
    totais: {
      vinculos: vinculos.length,
      municipiosComDados: municipios.length,
      unidadesComDados: unidades.length,
      faccoes: faccoesGlobais,
    },
    geradoEm: new Date().toISOString(),
  }
}

export function formatVinculo(v: Awaited<ReturnType<typeof fetchMapaVinculosComAip>>[number]) {
  return {
    id: v.id,
    municipio: v.municipio,
    municipioIbge: v.municipioIbge,
    unidadePrisional: v.unidadePrisional,
    observacoes: v.observacoes,
    cadastradoEm: v.cadastradoEm,
    apenado: {
      ...v.aipApenado,
      faccaoDisplay: faccaoDisplay(v.aipApenado),
      faccaoCor: faccaoCor(faccaoDisplay(v.aipApenado)),
    },
  }
}

export function normalizeMunicipioInput(nome: string, ibge?: number | null) {
  const normalized = normalizeMunicipioNome(nome)
  return { municipio: normalized, municipioIbge: ibge ?? null }
}