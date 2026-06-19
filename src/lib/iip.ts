export interface IIPFactor {
  id: string;
  label: string;
  pontos: number;
  critico: boolean;
}

export const IIP_FACTORS: IIPFactor[] = [
  { id: 'liderancaIdentificada', label: 'Liderança criminosa identificada', pontos: 10, critico: false },
  { id: 'novaLiderancaEmergente', label: 'Nova liderança emergente identificada', pontos: 15, critico: false },
  { id: 'ordemCriminosaUnidade', label: 'Ordem criminosa oriunda de unidade prisional', pontos: 15, critico: false },
  { id: 'planejamentoFuga', label: 'Planejamento de fuga ou resgate', pontos: 20, critico: true },
  { id: 'ameacaServidor', label: 'Ameaça contra servidor público', pontos: 15, critico: true },
  { id: 'comunicacaoIlicitaPreso', label: 'Comunicação ilícita vinculada a preso', pontos: 10, critico: false },
  { id: 'novaCelulaIdentificada', label: 'Nova célula criminosa identificada', pontos: 20, critico: false },
  { id: 'movimentacaoFinanceira', label: 'Movimentação financeira vinculada a preso/facção', pontos: 10, critico: false },
  { id: 'envolvimentoFaccaoNacional', label: 'Envolvimento de facção nacional', pontos: 10, critico: false },
  { id: 'apreensaoCelular', label: 'Apreensão de celular com relevância investigativa', pontos: 8, critico: false },
  { id: 'reflexoPrisional', label: 'Operação com reflexo direto no sistema prisional', pontos: 12, critico: false },
  { id: 'riscoMotim', label: 'Risco de motim, rebelião ou instabilidade prisional', pontos: 20, critico: true },
  { id: 'alvoSensivelPrisional', label: 'Alvo sensível vinculado ao sistema prisional', pontos: 15, critico: false },
  { id: 'difusaoImediataAip', label: 'Informação com necessidade de difusão imediata à AIP', pontos: 10, critico: true },
  { id: 'criticaOperador', label: 'Ocorrência classificada como crítica pelo servidor', pontos: 20, critico: false },
];

export type IIPLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface IIPResult {
  score: number;
  level: IIPLevel;
  alertaAtivo: boolean;
  acaoRecomendada: string;
  fatoresAtivos: string[];
}

export function calcularIIP(fatoresSelecionados: string[]): IIPResult {
  let score = 0;
  let hasCritico = false;
  const fatoresAtivos: string[] = [];

  for (const factorId of fatoresSelecionados) {
    const factor = IIP_FACTORS.find(f => f.id === factorId);
    if (factor) {
      score += factor.pontos;
      if (factor.critico) {
        hasCritico = true;
      }
      fatoresAtivos.push(factor.id);
    }
  }

  let level: IIPLevel = 'LOW';
  let acaoRecomendada = 'Registrar para histórico e acompanhamento.';

  if (score >= 60) {
    level = 'CRITICAL';
    acaoRecomendada = 'Gerar alerta imediato à Direção e recomendar produção de relatório de inteligência específico.';
  } else if (score >= 40) {
    level = 'HIGH';
    acaoRecomendada = 'Submeter à Direção de Inteligência para avaliação prioritária.';
  } else if (score >= 20) {
    level = 'MEDIUM';
    acaoRecomendada = 'Encaminhar para análise complementar da AIP.';
  }

  // Regra de Alerta Automático: score >= 40 ou se contiver algum fator crítico direto
  const alertaAtivo = score >= 40 || hasCritico;

  return {
    score,
    level,
    alertaAtivo,
    acaoRecomendada,
    fatoresAtivos
  };
}
