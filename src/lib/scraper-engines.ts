/**
 * Scraper Engine Abstraction — Strategy Pattern
 *
 * Permite múltiplos engines (Playwright, Firecrawl, etc) com interface comum
 * Usuário escolhe qual usar por sincronização
 */

// ── Interface Abstrata ────────────────────────────────────────
export interface ScraperEngineConfig {
  jobId: string
  unidadeId: string
  unidadeNome: string
}

export interface ApenadoRawData {
  sipeId: number
  nome: string
  nomeOutro?: string | null
  cpf?: string | null
  rg?: string | null
  rgOrgao?: string | null
  dataNascimento?: string | null
  sexo?: string | null
  etnia?: string | null
  naturalidade?: string | null
  orientacaoSexual?: string | null
  tipoSanguineo?: string | null
  grauInstrucao?: string | null
  religiao?: string | null
  estadoCivil?: string | null
  nomeConjuge?: string | null
  qtdFilhos?: number | null
  nomeMae?: string | null
  nomePai?: string | null
  telefone?: string | null
  rji?: string | null
  unidade?: string | null
  cela?: string | null
  regime?: string | null
  situacao?: string | null
  dataEntrada?: string | null
  dataPrisao?: string | null
  tempoPena?: string | null
  faccao?: string | null
  monitorado?: boolean | null
  intramuro?: boolean | null
  presoOriundo?: string | null
  oficioEntrada?: string | null
  celeAtual?: string | null
  ultimaMovimentacao?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  cep?: string | null
  photoPath?: string | null
  [key: string]: any
}

export abstract class ScraperEngine {
  protected config: ScraperEngineConfig
  protected engineName: 'playwright' | 'firecrawl'

  constructor(config: ScraperEngineConfig, engineName: 'playwright' | 'firecrawl') {
    this.config = config
    this.engineName = engineName
  }

  abstract get name(): 'playwright' | 'firecrawl'

  /**
   * Autenticar/preparar engine
   */
  abstract login(): Promise<void>

  /**
   * Coleta IDs de apenados por unidade
   */
  abstract coletarIdsApenados(): Promise<number[]>

  /**
   * Scrape detalhado de um apenado
   */
  abstract scrapeApenadoFicha(sipeId: number): Promise<ApenadoRawData>

  /**
   * Cleanup - liberar recursos
   */
  abstract cleanup(): Promise<void>

  /**
   * Report progress
   */
  protected async reportProgress(data: any) {
    // Será implementado pela classe concreta
  }
}

// ── Factory ────────────────────────────────────────────────────
/**
 * Factory para criar instance do engine selecionado
 * Nota: Importações diretas evitam dependency issues
 */
export async function createScraperEngine(
  engineType: 'playwright' | 'firecrawl',
  config: ScraperEngineConfig
): Promise<ScraperEngine> {
  if (engineType === 'firecrawl') {
    const { FirecrawlEngine } = await import('./scraper-engines/firecrawl')
    return new FirecrawlEngine(config)
  } else {
    // Default: Playwright
    const { PlaywrightEngine } = await import('./scraper-engines/playwright')
    return new PlaywrightEngine(config)
  }
}

// ── Type Guards ────────────────────────────────────────────────
export function isValidEngineType(value: string): value is 'playwright' | 'firecrawl' {
  return value === 'playwright' || value === 'firecrawl'
}
