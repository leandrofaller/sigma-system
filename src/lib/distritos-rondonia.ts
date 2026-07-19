/**
 * Mapeamento dos Distritos do Estado de Rondônia por Município
 */

export const DISTRITOS_POR_MUNICIPIO: Record<string, string[]> = {
  "Alta Floresta d'Oeste": ['Izidolândia', "Vila Nova de Rondônia"],
  'Alto Alegre dos Parecis': ['Alto da União'],
  'Alto Paraíso': ['Vila Nova Samuel'],
  "Alvorada d'Oeste": ['Terra Boa'],
  'Ariquemes': ['Bom Futuro', 'Joelândia'],
  'Buritis': ['Jacinópolis'],
  'Cacoal': ['Alta Razão', 'Novo Horizonte', 'Riozinho'],
  'Campo Novo de Rondônia': ['Três Coqueiros'],
  'Candeias do Jamari': ['Triunfo', 'Vila Samuel'],
  'Chupinguaia': ['Boa Esperança', 'Guaporé', 'Novo Plano'],
  'Colorado do Oeste': ['Novo Plano'],
  'Corumbiara': ['Rondolândia'],
  'Costa Marques': ['Forte Príncipe da Beira', 'São Sebastião'],
  "Espigão d'Oeste": ['Boa Vista do Pacarana'],
  'Governador Jorge Teixeira': ['Colina Verde'],
  'Guajará-Mirim': ['Iata', 'Surpresa'],
  'Jaru': ['Bom Jesus', 'Santa Luzia do Jaru', 'Tarilândia'],
  'Ji-Paraná': ['Nova Colina', 'Nova Londrina'],
  "Machadinho d'Oeste": ['5º BEC', 'Guatá', 'Tabajara'],
  'Ministro Andreazza': ['Nova Xavantina'],
  'Mirante da Serra': ['Novo Horizonte'],
  "Nova Brasilândia d'Oeste": ['Santana'],
  'Nova Mamoré': ['Araras', 'Nova Dimensão', 'Palmeiras'],
  'Novo Horizonte do Oeste': ['Migrantinópolis'],
  'Ouro Preto do Oeste': ['Rondominas'],
  'Pimenta Bueno': ['Marco Rondon'],
  'Porto Velho': [
    'Abunã',
    'Calama',
    'Demarcação',
    'Extrema',
    'Fortaleza do Abunã',
    'Jaci-Paraná',
    'Mutum-Paraná',
    'Nazareth',
    'Nova Califórnia',
    'São Carlos',
    'União Bandeirantes',
    'Vista Alegre do Abunã',
  ],
  'Presidente Médici': ['Estrela de Rondônia', 'Novo Riachuelo', 'Vila Camargo'],
  'Primavera de Rondônia': ['Querência do Norte'],
  'Rolim de Moura': ['Nova Estrela'],
  "Santa Luzia d'Oeste": ['Nova Conquista'],
  'São Francisco do Guaporé': ['Porto Murtinho'],
  'São Miguel do Guaporé': ['Santana do Guaporé'],
  'Seringueiras': ['Bom Sucesso'],
  'Theobroma': ['Vila Palmares'],
  'Urupá': ['Bom Jesus'],
  'Vale do Anari': ['MP-50'],
  'Vilhena': ['Nova Conquista'],
}

/** Mapa inverso: Nome do distrito -> Município pai */
export const DISTRITO_PARA_MUNICIPIO: Record<string, string> = Object.entries(
  DISTRITOS_POR_MUNICIPIO
).reduce((acc, [municipio, distritos]) => {
  for (const d of distritos) {
    acc[d] = municipio
  }
  return acc
}, {} as Record<string, string>)

/** Lista completa e ordenada de todos os distritos cadastrados em RO */
export const TODOS_DISTRITOS_RO: string[] = Array.from(
  new Set(Object.values(DISTRITOS_POR_MUNICIPIO).flat())
).sort((a, b) => a.localeCompare(b, 'pt-BR'))

/**
 * Retorna a lista de distritos para um município específico
 */
export function getDistritosDoMunicipio(municipio?: string | null): string[] {
  if (!municipio) return []
  return DISTRITOS_POR_MUNICIPIO[municipio] ?? []
}

/**
 * Descobre o município correspondente a um distrito
 */
export function getMunicipioDoDistrito(distrito?: string | null): string | null {
  if (!distrito) return null
  return DISTRITO_PARA_MUNICIPIO[distrito] ?? null
}
