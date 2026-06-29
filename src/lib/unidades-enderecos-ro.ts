import { containsNormalized } from '@/lib/search'

export interface UnidadeEndereco {
  id: string
  comarca: string
  unidade: string
  endereco: string
  cep: string
}

export const UNIDADES_ENDERECOS_RO: UnidadeEndereco[] = [
  // PORTO VELHO
  { id: 'pv-jorge-thiago', comarca: 'PORTO VELHO', unidade: 'PENITENCIÁRIA ESTADUAL JORGE THIAGO AGUIAR AFONSO', endereco: 'Estrada da Penal, km 7,5 - Zona Rural', cep: '76811-520' },
  { id: 'pv-urso', comarca: 'PORTO VELHO', unidade: 'CENTRO DE DETENÇÃO PROVISÓRIO DE PORTO VELHO (ANTIGO URSO)', endereco: 'Estrada da Penal, Km 5 - Zona Rural', cep: '76800-000' },
  { id: 'pv-panda', comarca: 'PORTO VELHO', unidade: 'PENITENCIÁRIA ESTADUAL EDIVAN MARIANO ROSENDO (PANDA)', endereco: 'Estrada da Penal, S/N - Zona Rural', cep: '76900-000' },
  { id: 'pv-enio', comarca: 'PORTO VELHO', unidade: 'PENITENCIÁRIA DE MÉDIO PORTE (ANTIGO ÊNIO)', endereco: 'Estrada da Penal, Km 4,5 - Zona Rural', cep: '76820-710' },
  { id: 'pv-suely', comarca: 'PORTO VELHO', unidade: 'CENTRO DE RESSOCIALIZAÇÃO SUELY MARIA MENDONÇA (PENFEN e PEPFEM UNIFICADAS)', endereco: 'Rua Antônio Violão, N° 4675 - Escola de Polícia', cep: '76824-749' },
  { id: 'pv-capep', comarca: 'PORTO VELHO', unidade: 'COLÔNIA AGRÍCOLA PENAL ÊNIO DOS SANTOS PINHEIRO (CAPEP)', endereco: 'Estrada da Penal, Km 4,5 - Zona Rural', cep: '76880-000' },
  { id: 'pv-medidas-seguranca', comarca: 'PORTO VELHO', unidade: 'UNIDADE DE INTERNAÇÃO MASCULINA MEDIDAS DE SEGURANÇA', endereco: 'Estrada da Penal, Km 5 - Zona Rural', cep: '78900-000' },
  { id: 'pv-crvg', comarca: 'PORTO VELHO', unidade: 'CENTRO DE RESSOCIALIZAÇÃO VALE DO GUAPORÉ (CRVG)', endereco: 'Estrada da Penal, S/N - Zona Rural', cep: '76800-000' },
  { id: 'pv-umesp', comarca: 'PORTO VELHO', unidade: 'UNIDADE DE MONITORAMENTO ELETRÔNICO - UMESP (CAPITAL)', endereco: 'Rua Pio XII, N° 2572 - Liberdade', cep: '76803-872' },
  { id: 'pv-usafam', comarca: 'PORTO VELHO', unidade: 'UNIDADE SEMIABERTO E ABERTO FEMININO E ALBERGUE MASCULINO (USAFAM)', endereco: 'Rua Rui Barbosa, N° 517 - Arigolândia', cep: '76801-196' },
  { id: 'pv-aruana', comarca: 'PORTO VELHO', unidade: 'PENITENCIÁRIA ESTADUAL ARUANA', endereco: 'Estrada da Penal, km 7,5 - Zona Rural', cep: '76811-520' },
  { id: 'pv-milton', comarca: 'PORTO VELHO', unidade: 'PENITENCIÁRIA ESTADUAL MILTON SOARES DE CARVALHO (470)', endereco: 'Estrada da Penal, km 6,5 - Zona Rural', cep: '78900-000' },
  // GUAJARÁ-MIRIM
  { id: 'gm-nova-mamore', comarca: 'GUAJARÁ-MIRIM', unidade: 'PENITENCIÁRIA REGIONAL DE NOVA MAMORÉ', endereco: 'Br-425, KM-40 - Zona Rural', cep: '76850-000' },
  { id: 'gm-detencao', comarca: 'GUAJARÁ-MIRIM', unidade: 'CASA DE DETENÇÃO DE GUAJARÁ MIRIM', endereco: 'Avenida Mascarenha de Moraes, S/N - 10 de Abril', cep: '76850-000' },
  { id: 'gm-albergue-fem', comarca: 'GUAJARÁ-MIRIM', unidade: 'CASA DE PRISÃO ALBERGUE FEMININO DE GUAJARÁ MIRIM', endereco: 'Rua Antônio Correia da Costa, S/N - 10 de Abril', cep: '76850-000' },
  { id: 'gm-semiaberto', comarca: 'GUAJARÁ-MIRIM', unidade: 'UNIDADE SEMIABERTO E ABERTO MASCULINO DE GUAJARÁ MIRIM', endereco: 'Avenida Duque de Caxias, N° 3290 - Santa Luzia', cep: '76850-000' },
  // ARIQUEMES
  { id: 'ariq-cr', comarca: 'ARIQUEMES', unidade: 'CENTRO DE RESSOCIALIZAÇÃO DE ARIQUEMES', endereco: 'Br-364, Linha C-75, Lote 28-A - Zona Rural', cep: '76876-718' },
  { id: 'ariq-albergado', comarca: 'ARIQUEMES', unidade: 'CASA DO ALBERGADO E PRESÍDIO FEMININO DE ARIQUEMES', endereco: 'Rua Caraíbas, S/N, Setor Grandes Areas - Jardim Jorge Teixeira', cep: '78876-718' },
  // BURITIS
  { id: 'buritis-cr', comarca: 'BURITIS', unidade: 'CENTRO DE RESSOCIALIZAÇÃO JONAS FERRETI', endereco: 'Estrada Projetada, Km 07 - Zona Rural', cep: '76880-000' },
  // MACHADINHO DO OESTE
  { id: 'machadinho-cr', comarca: 'MACHADINHO DO OESTE', unidade: 'CENTRO DE RESSOCIALIZAÇÃO DE MACHADINHO DO OESTE', endereco: 'RO 133, Km 8 - Zona Rural', cep: '76868-000' },
  // JARU
  { id: 'jaru-crr', comarca: 'JARU', unidade: 'CENTRO REGIONAL DE RESSOCIALIZAÇÃO AUGUSTO S. KEMPE', endereco: 'Rua Raimundo Catanhede, N° 824 - Setor 02', cep: '76890-000' },
  { id: 'jaru-albergue', comarca: 'JARU', unidade: 'CASA DE PRISÃO ALBERGUE DE JARU E SEMIABERTO', endereco: 'Rua Princesa Isabel, N° 740 - Setor 02', cep: '76890-000' },
  // OURO PRETO
  { id: 'ouro-preto', comarca: 'OURO PRETO', unidade: 'CASA DE DETENÇÃO DE OURO PRETO', endereco: 'Rua Padre Adolpho Rohl, N° 793 - Jardim Badeirantes', cep: '76920-000' },
  // JI-PARANÁ
  { id: 'jip-detencao', comarca: 'JI-PARANÁ', unidade: 'CASA DE DETENÇÃO DE JI-PARANÁ', endereco: 'Avenida 02 de Abril, S/N - Urupá', cep: '76900-149' },
  { id: 'jip-monitoramento', comarca: 'JI-PARANÁ', unidade: 'UNIDADE DE MONITORAMENTO DE JI-PARANÁ', endereco: 'Avenida 02 de Abril, N° 1360 - Centro', cep: '76900-114' },
  { id: 'jip-semiaberto', comarca: 'JI-PARANÁ', unidade: 'PRESÍDIO SEMIABERTO DE JI-PARANÁ', endereco: 'Estrada do Nazaré, km 3,5 - Zona Rural', cep: '76900-000' },
  { id: 'jip-penitenciaria', comarca: 'JI-PARANÁ', unidade: 'PENITENCIÁRIA REGIONAL DR. AGENOR MARTINS DE CARVALHO', endereco: 'Estrada do Nazaré, km 4,5 - Zona Rural', cep: '76960-000' },
  // PRESIDENTE MÉDICI
  { id: 'pres-medici', comarca: 'PRESIDENTE MÉDICI', unidade: 'CADEIA PÚBLICA DE PRESIDENTE MÉDICI', endereco: 'Rua Minas Gerais, N° 2776 - Centro', cep: '76916-000' },
  // ALVORADA D'OESTE
  { id: 'alvorada-cr', comarca: "ALVORADA D'OESTE", unidade: 'CENTRO DE RESSOCIALIZAÇÃO YOHAN FLÁVIO VASSOLER', endereco: 'RO 473, km 2,5 - Zona Rural', cep: '76930-000' },
  // SÃO MIGUEL DO GUAPORÉ
  { id: 'smg-cadeia', comarca: 'SÃO MIGUEL DO GUAPORÉ', unidade: 'CADEIA PÚBLICA DE SÃO MIGUEL DO GUAPORÉ', endereco: 'Rua Dom Pedro II, N° 2605 - Centro', cep: '' },
  // SÃO FRANCISCO DO GUAPORÉ
  { id: 'sfg-cadeia', comarca: 'SÃO FRANCISCO DO GUAPORÉ', unidade: 'CADEIA PÚBLICA DE SÃO FRANCISCO DO GUAPORÉ', endereco: 'Avenida Brasil, N° 3742 - Centro', cep: '' },
  // COSTA MARQUES
  { id: 'costa-marques', comarca: 'COSTA MARQUES', unidade: 'CADEIA PÚBLICA DE COSTA MARQUES', endereco: 'Avenida Cabixi, N° 1666 - Setor 02', cep: '76937-000' },
  // CACOAL
  { id: 'cacoal-detencao', comarca: 'CACOAL', unidade: 'CASA DE DETENÇÃO DE CACOAL', endereco: 'Avenida Itapemirim, N° 421 - Novo Cacoal', cep: '76962-227' },
  { id: 'cacoal-albergue', comarca: 'CACOAL', unidade: 'CASA DE PRISÃO ALBERGUE MASCULINO DE CACOAL - MONITORAMENTO', endereco: 'Avenida Afonso Pena, N° 3085 - Princesa Izabel', cep: '78575-000' },
  // ROLIM DE MOURA
  { id: 'rolim-detencao', comarca: 'ROLIM DE MOURA', unidade: 'CASA DE DETENÇÃO DE ROLIM DE MOURA', endereco: 'Avenida Macapá, N° 5791 - São Cristovão', cep: '76940-000' },
  { id: 'rolim-monitoramento', comarca: 'ROLIM DE MOURA', unidade: 'UNIDADE ABERTO E SEMIABERTO DE ROLIM DE MOURA - MONITORAMENTO', endereco: 'Rua Barão de Melgaço, S/N - Planalto', cep: '76950-000' },
  { id: 'rolim-penitenciaria', comarca: 'ROLIM DE MOURA', unidade: 'PENITENCIÁRIA REGIONAL DE ROLIM DE MOURA', endereco: 'Rua H, N° 6399 - Cidade Alta', cep: '76940-000' },
  // PIMENTA BUENO
  { id: 'pimenta-bueno', comarca: 'PIMENTA BUENO', unidade: 'CASA DE DETENÇÃO DE PIMENTA BUENO', endereco: 'Avenida Presidente Dutra, S/N - Pioneiros', cep: '76970-000' },
  // ALTA FLORESTA
  { id: 'alta-floresta', comarca: 'ALTA FLORESTA', unidade: 'CADEIA PÚBLICA DE ALTA FLORESTA', endereco: 'Avenida Amapa, S/N - Santa Felicidade', cep: '76954-000' },
  // VILHENA
  { id: 'vilhena-detencao', comarca: 'VILHENA', unidade: 'CASA DE DETENÇÃO DE VILHENA', endereco: 'Avenida Capitão Castro, N° 2047 - Centro', cep: '76980-000' },
  { id: 'vilhena-colonia', comarca: 'VILHENA', unidade: 'COLÔNIA PENAL, MONITORAMENTO E PRESÍDIO FEMININO DE VILHENA', endereco: 'Avenida Rosalina Adélia Marangoni, S/N - Jardim América', cep: '76980-000' },
  { id: 'vilhena-cone-sul', comarca: 'VILHENA', unidade: 'CENTRO DE RESSOCIALIZAÇÃO CONE SUL', endereco: 'Rua 5409, nº 2200, Setor Chacareiro, Quadra CH 54 - Lote 70, 71', cep: '76980-000' },
  // COLORADO DO OESTE
  { id: 'colorado', comarca: 'COLORADO DO OESTE', unidade: 'CADEIA PÚBLICA DE COLORADO DO OESTE', endereco: 'Avenida Guaporé, N° 3465 - Santa Luzia', cep: '76993-000' },
  // CEREJEIRAS
  { id: 'cerejeiras', comarca: 'CEREJEIRAS', unidade: 'CADEIA PÚBLICA DE CEREJEIRAS', endereco: 'Rua Goiás, N° 1240 - Alvorada', cep: '76997-000' },
]

export const COMARCAS_RO = [...new Set(UNIDADES_ENDERECOS_RO.map((u) => u.comarca))].sort()

export function formatCep(cep: string): string {
  const d = cep.replace(/\D/g, '')
  if (d.length !== 8) return cep || '—'
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

export function enderecoCompleto(u: UnidadeEndereco): string {
  const base = `${u.endereco}, ${u.comarca} - RO, Brasil`
  return u.cep ? `${base}, CEP ${formatCep(u.cep)}` : base
}

export function googleMapsSearchUrl(u: UnidadeEndereco): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto(u))}`
}

export function googleMapsEmbedUrl(u: UnidadeEndereco): string {
  const q = encodeURIComponent(enderecoCompleto(u))
  return `https://maps.google.com/maps?q=${q}&hl=pt&z=15&output=embed`
}

export function googleMapsDirectionsUrl(u: UnidadeEndereco): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoCompleto(u))}`
}

export function filtrarUnidades(
  unidades: UnidadeEndereco[],
  query: string,
  comarca: string | null
): UnidadeEndereco[] {
  const q = query.trim()
  return unidades.filter((u) => {
    if (comarca && u.comarca !== comarca) return false
    if (!q) return true
    const hay = `${u.comarca} ${u.unidade} ${u.endereco} ${u.cep}`
    return containsNormalized(hay, q)
  })
}