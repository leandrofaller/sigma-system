'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDate } from '@/lib/utils';
import { Printer } from 'lucide-react';
import { calcularIIP, IIP_FACTORS } from '@/lib/iip';

interface RelatorioData {
  id?: string;
  number: string;
  date: string;
  periodoInicio: string;
  periodoFim: string;
  forcaTarefa: string;
  status: string;
  municipio?: string;
  faccoes?: string[];
  iipScore?: number;
  iipLevel?: string;
  ripStatus?: string;
  iipFactors?: string[];
  providencias?: string | null;
  observacoesAip?: string | null;
  alertaAtivo?: boolean;
  alertaResolvido?: boolean;
  author?: {
    name: string;
  } | null;
  content: {
    identificacao?: {
      servidor?: string;
      matricula?: string;
      unidadeOrigem?: string;
    };
    resumoExecutivo?: string;
    participacaoOperacional?: {
      inteligencia?: number;
      ostensiva?: number;
      mandados?: number;
      monitoramento?: number;
      reunioes?: number;
      outras?: number;
    };
    alvosEstrategicos?: {
      categorias?: string[];
      descricao?: string;
    };
    faccoesRelacionadas?: {
      categorias?: string[];
      observacoes?: string;
    };
    impactosSistemaPrisional?: string;
    produtosInteligencia?: {
      relatorios?: number;
      informes?: number;
      alertas?: number;
      analises?: number;
      outros?: number;
    };
    resultadosRelevantes?: {
      categorias?: string[];
      descricao?: string;
    };
    avaliacaoRisco?: {
      classificacao?: string;
      justificativa?: string;
    };
    demandasAip?: string;
    observacoesDiretor?: string;
  };
}

interface Props {
  form: RelatorioData;
}

const riscoColors: Record<string, string> = {
  BAIXO: '#16a34a', // Verde
  MÉDIO: '#ca8a04', // Amarelo
  ALTO: '#ea580c',  // Laranja
  CRÍTICO: '#dc2626', // Vermelho
};

const LEGAL_TEXT = `"Declaro que as informações registradas neste relatório observam os princípios da necessidade de conhecer, compartimentação da informação, proteção do sigilo investigativo e demais normas aplicáveis à atividade de inteligência e investigação criminal."`;

function buildPrintHtml(contentHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page { size: A4 portrait; margin: 1.8cm 2cm 1.8cm 2cm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.4;
    color: #000;
    background: white;
    padding: 0;
    margin: 0;
    width: 100%;
  }
  img { max-width: 100%; }
  p { margin: 0 0 4px; orphans: 3; widows: 3; }
  hr { border: none; border-top: 1.5px solid #000; margin: 8px 0 10px; }
  p, li, tr { break-inside: avoid; }
  .section-title {
    font-size: 11pt;
    font-weight: bold;
    text-transform: uppercase;
    background: #f3f4f6;
    padding: 4px 8px;
    margin-top: 12px;
    margin-bottom: 6px;
    border-left: 3px solid #111827;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc-footer {
    margin-top: 30px;
    padding: 8px 0 0;
    border-top: 1px solid #000;
    break-inside: avoid;
    text-align: center;
  }
  .doc-footer p {
    font-size: 8pt;
    font-style: italic;
    color: #000;
    line-height: 1.3;
    margin: 0;
  }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; }
  th, td { border: 1px solid #000; padding: 4px 6px; font-size: 9.5pt; vertical-align: top; }
  th { background: #f3f4f6; font-weight: bold; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .risk-badge {
    display: inline-block;
    padding: 2px 8px;
    font-weight: bold;
    font-size: 9pt;
    border-radius: 4px;
    color: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
</head>
<body>
${contentHtml}
<div class="doc-footer"><p>${LEGAL_TEXT}</p></div>
<script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}<\/script>
</body>
</html>`;
}

export function RelatorioForcaTarefaPreview({ form }: Props) {
  const [badgeSizes, setBadgeSizes] = useState({ sejus: 64, aip: 72, policiaPenal: 64 });
  
  const iipFactorsSelected = form.iipFactors || [];
  const iipCalculado = calcularIIP(iipFactorsSelected);
  const iipScore = form.iipScore !== undefined ? form.iipScore : iipCalculado.score;
  const iipLevel = form.iipLevel !== undefined ? form.iipLevel : iipCalculado.level;
  const iipAcao = iipCalculado.acaoRecomendada;
  const fatoresAtivos = IIP_FACTORS.filter(f => iipFactorsSelected.includes(f.id));
  const [badgeTs, setBadgeTs] = useState(() => Date.now());
  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/relint-config')
      .then((r) => r.json())
      .then((d) => { setBadgeSizes((prev) => ({ ...prev, ...d })); setBadgeTs(Date.now()); })
      .catch(() => {});
  }, []);

  const badgeUrl = (key: string) => `/logos/${key}.png?t=${badgeTs}`;

  const handlePrint = async () => {
    const html = printAreaRef.current?.innerHTML;
    if (!html) return;

    const toDataUri = async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch { return null; }
    };

    let printHtml = html;
    const badgeKeys = ['badge-sejus', 'badge-aip', 'badge-policia-penal'];
    for (const key of badgeKeys) {
      const dataUri = await toDataUri(badgeUrl(key));
      if (dataUri) {
        printHtml = printHtml.replace(
          new RegExp(`src="/logos/${key}\\.png[^"]*"`, 'g'),
          `src="${dataUri}"`
        );
      }
    }

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Permita pop-ups para imprimir.'); return; }
    win.document.write(buildPrintHtml(printHtml, form.number || 'Relatorio_Forca_Tarefa'));
    win.document.close();
  };

  const risco = form.content.avaliacaoRisco?.classificacao?.toUpperCase() || 'BAIXO';
  const riskColor = riscoColors[risco] || '#16a34a';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500 font-sans">Pré-visualização do Relatório</span>
        <button onClick={handlePrint}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors font-sans">
          <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
        </button>
      </div>

      {/* Documento A4 */}
      <div ref={printAreaRef} className="bg-white text-black leading-relaxed"
        style={{ fontFamily: 'Arial, sans-serif', fontSize: '10.5pt', padding: '0.8cm 2cm 1.5cm', minHeight: '27cm', width: '100%' }}>

        {/* Cabeçalho AIP Oficial */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
          <div style={{ width: badgeSizes.sejus, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src={badgeUrl('badge-sejus')} alt="SEJUS" style={{ width: badgeSizes.sejus, height: 'auto' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p style={{ fontWeight: 'bold', fontSize: '9pt', margin: '0 0 2px', textTransform: 'uppercase' }}>SECRETARIA DE ESTADO DA JUSTIÇA DE RONDÔNIA</p>
            <p style={{ fontWeight: 'bold', fontSize: '9pt', margin: '0 0 2px', textTransform: 'uppercase' }}>AGÊNCIA DE INTELIGÊNCIA PENAL</p>
            <p style={{ fontWeight: 'bold', fontSize: '9.5pt', margin: '2px 0 6px', textTransform: 'uppercase' }}>AIP/SEJUS/RO</p>
            <img src={badgeUrl('badge-aip')} alt="AIP/SEJUS/RO" style={{ width: badgeSizes.aip, height: 'auto' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div style={{ width: badgeSizes.policiaPenal, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src={badgeUrl('badge-policia-penal')} alt="Polícia Penal RO" style={{ width: badgeSizes.policiaPenal, height: 'auto' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        </div>

        <hr style={{ margin: '6px 0 10px', borderTop: '1.5px solid #000', borderBottom: 'none', borderLeft: 'none', borderRight: 'none' }} />

        {/* Título Principal */}
        <div style={{ textAlign: 'center', marginBottom: '14px' }}>
          <p style={{ fontWeight: 'bold', fontSize: '12pt', margin: '0 0 4px', textDecoration: 'underline' }}>
            {form.number || 'RELATÓRIO DE FORÇA-TAREFA Nº ___/20__'}
          </p>
          <p style={{ fontSize: '9.5pt', color: '#333', margin: 0 }}>
            <strong>Período de Referência:</strong> {form.periodoInicio ? formatDate(new Date(form.periodoInicio + 'T12:00:00')) : '__/__/____'} a {form.periodoFim ? formatDate(new Date(form.periodoFim + 'T12:00:00')) : '__/__/____'}
          </p>
        </div>

        {/* Seção 1: Identificação */}
        <div style={{ display: 'block', breakInside: 'avoid' }}>
          <div className="section-title">1. Identificação</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
            <tbody>
              <tr>
                <td style={{ width: '50%' }}><strong>Servidor:</strong> {form.content.identificacao?.servidor || form.author?.name || '_______________'}</td>
                <td style={{ width: '50%' }}><strong>Matrícula:</strong> {form.content.identificacao?.matricula || '_______________'}</td>
              </tr>
              <tr>
                <td><strong>Unidade de Origem:</strong> {form.content.identificacao?.unidadeOrigem || '_______________'}</td>
                <td><strong>Força-Tarefa / Operação:</strong> {form.forcaTarefa || '_______________'}</td>
              </tr>
              <tr>
                <td><strong>Município de Atuação:</strong> {form.municipio || 'Porto Velho'}</td>
                <td><strong>Status do Relatório:</strong> {form.status === 'PUBLISHED' ? 'PUBLICADO' : 'RASCUNHO'}</td>
              </tr>
              <tr>
                <td><strong>Data de Preenchimento:</strong> {form.date ? formatDate(new Date(form.date + 'T12:00:00')) : '__/__/____'}</td>
                <td><strong>Facções Relacionadas:</strong> {form.faccoes && form.faccoes.length > 0 ? form.faccoes.join(', ') : 'Nenhuma'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Seção 2: Resumo Executivo */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">2. Resumo Executivo</div>
          <div style={{ padding: '4px 6px', textAlign: 'justify', whiteSpace: 'pre-wrap', minHeight: '60px' }}>
            {form.content.resumoExecutivo || 'Nenhuma atividade registrada no período.'}
          </div>
        </div>

        {/* Seção 3: Participação Operacional */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">3. Participação Operacional</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
            <thead>
              <tr>
                <th style={{ width: '70%' }}>Tipo de Ação / Operação</th>
                <th style={{ width: '30%', textAlign: 'center' }}>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Operações de inteligência</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.participacaoOperacional?.inteligencia ?? 0}</td>
              </tr>
              <tr>
                <td>Operações ostensivas</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.participacaoOperacional?.ostensiva ?? 0}</td>
              </tr>
              <tr>
                <td>Cumprimento de mandados</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.participacaoOperacional?.mandados ?? 0}</td>
              </tr>
              <tr>
                <td>Ações de monitoramento</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.participacaoOperacional?.monitoramento ?? 0}</td>
              </tr>
              <tr>
                <td>Reuniões operacionais</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.participacaoOperacional?.reunioes ?? 0}</td>
              </tr>
              <tr>
                <td>Outras atividades</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.participacaoOperacional?.outras ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Seção 4: Alvos Estratégicos Envolvidos */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">4. Alvos Estratégicos Envolvidos</div>
          <div style={{ marginBottom: '6px', fontSize: '9.5pt' }}>
            <strong>Categorias Envolvidas:</strong>&nbsp;
            {form.content.alvosEstrategicos?.categorias && form.content.alvosEstrategicos.categorias.length > 0
              ? form.content.alvosEstrategicos.categorias.join(', ')
              : 'Nenhuma selecionada'}
          </div>
          <div style={{ padding: '4px 6px', textAlign: 'justify', whiteSpace: 'pre-wrap', border: '1px solid #ddd', borderRadius: '4px', minHeight: '40px', fontSize: '9.5pt' }}>
            <strong>Descrição dos Alvos:</strong><br />
            {form.content.alvosEstrategicos?.descricao || 'Nenhuma descrição fornecida.'}
          </div>
        </div>

        {/* Seção 5: Facções ou Grupos Criminosos Relacionados */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">5. Facções ou Grupos Criminosos Relacionados</div>
          <div style={{ marginBottom: '6px', fontSize: '9.5pt' }}>
            <strong>Facções Identificadas:</strong>&nbsp;
            {form.content.faccoesRelacionadas?.categorias && form.content.faccoesRelacionadas.categorias.length > 0
              ? form.content.faccoesRelacionadas.categorias.join(', ')
              : 'Nenhuma identificada'}
          </div>
          <div style={{ padding: '4px 6px', textAlign: 'justify', whiteSpace: 'pre-wrap', border: '1px solid #ddd', borderRadius: '4px', minHeight: '40px', fontSize: '9.5pt' }}>
            <strong>Observações Estratégicas sobre Grupos Criminosos:</strong><br />
            {form.content.faccoesRelacionadas?.observacoes || 'Nenhuma observação registrada.'}
          </div>
        </div>

        {/* Seção 6: Impactos para o Sistema Prisional */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">6. Impactos para o Sistema Prisional</div>
          <div style={{ padding: '4px 6px', textAlign: 'justify', whiteSpace: 'pre-wrap', minHeight: '50px' }}>
            {form.content.impactosSistemaPrisional || 'Não foram identificados impactos diretos relevantes no sistema prisional durante o período.'}
          </div>
        </div>

        {/* Seção 7: Produtos de Inteligência Produzidos */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">7. Produtos de Inteligência Produzidos</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
            <thead>
              <tr>
                <th style={{ width: '20%', textAlign: 'center' }}>Relatórios</th>
                <th style={{ width: '20%', textAlign: 'center' }}>Informes</th>
                <th style={{ width: '20%', textAlign: 'center' }}>Alertas</th>
                <th style={{ width: '20%', textAlign: 'center' }}>Análises</th>
                <th style={{ width: '20%', textAlign: 'center' }}>Outros</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.produtosInteligencia?.relatorios ?? 0}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.produtosInteligencia?.informes ?? 0}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.produtosInteligencia?.alertas ?? 0}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.produtosInteligencia?.analises ?? 0}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{form.content.produtosInteligencia?.outros ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Seção 8: Resultados Relevantes */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">8. Resultados Relevantes</div>
          <div style={{ marginBottom: '6px', fontSize: '9.5pt' }}>
            <strong>Indicadores de Resultados:</strong>&nbsp;
            {form.content.resultadosRelevantes?.categorias && form.content.resultadosRelevantes.categorias.length > 0
              ? form.content.resultadosRelevantes.categorias.join(', ')
              : 'Nenhum indicador selecionado'}
          </div>
          <div style={{ padding: '4px 6px', textAlign: 'justify', whiteSpace: 'pre-wrap', border: '1px solid #ddd', borderRadius: '4px', minHeight: '40px', fontSize: '9.5pt' }}>
            <strong>Detalhamento dos Resultados:</strong><br />
            {form.content.resultadosRelevantes?.descricao || 'Nenhum resultado detalhado.'}
          </div>
        </div>

        {/* Seção 9: Avaliação de Risco */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">9. Avaliação de Risco</div>
          <div style={{ marginBottom: '6px', fontSize: '9.5pt' }}>
            <strong>Nível de Risco Operacional:</strong>&nbsp;
            <span className="risk-badge" style={{ backgroundColor: riskColor }}>
              {risco}
            </span>
          </div>
          <div style={{ padding: '4px 6px', textAlign: 'justify', whiteSpace: 'pre-wrap', border: '1px solid #ddd', borderRadius: '4px', minHeight: '40px', fontSize: '9.5pt' }}>
            <strong>Justificativa da Classificação de Risco:</strong><br />
            {form.content.avaliacaoRisco?.justificativa || 'Nenhuma justificativa registrada.'}
          </div>
        </div>

        {/* Seção 10: Índice de Impacto Prisional (IIP) */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">10. Índice de Impacto Prisional (IIP)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
            <tbody>
              <tr>
                <td style={{ width: '50%' }}><strong>Score do IIP:</strong> <span style={{ fontWeight: 'bold' }}>{iipScore} pontos</span></td>
                <td style={{ width: '50%' }}>
                  <strong>Nível de Impacto:</strong>&nbsp;
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: iipLevel === 'CRITICAL' ? '#dc2626' : iipLevel === 'HIGH' ? '#ea580c' : iipLevel === 'MEDIUM' ? '#ca8a04' : '#16a34a' 
                  }}>
                    {iipLevel === 'CRITICAL' ? 'CRÍTICO' : iipLevel === 'HIGH' ? 'ALTO' : iipLevel === 'MEDIUM' ? 'MÉDIO' : 'BAIXO'}
                  </span>
                </td>
              </tr>
              {form.alertaAtivo && (
                <tr>
                  <td colSpan={2} style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '9pt' }}>
                    ⚠️ ALERTA CRÍTICO ATIVO PARA A DIREÇÃO AIP
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          
          <div style={{ padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '9.5pt', marginBottom: '8px' }}>
            <strong>Ação Recomendada:</strong> {iipAcao}
          </div>
          
          <div style={{ padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '9.5pt', marginBottom: '8px' }}>
            <strong>Fatores Ativados:</strong>
            {fatoresAtivos.length > 0 ? (
              <ul style={{ margin: '4px 0 0', paddingLeft: '20px' }}>
                {fatoresAtivos.map(f => (
                  <li key={f.id} style={{ marginBottom: '2px' }}>
                    {f.label} <span style={{ color: '#666', fontSize: '8.5pt' }}>(+{f.pontos} pts)</span>
                    {f.critico && <span style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '8pt' }}> [CRÍTICO]</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <span style={{ color: '#666', fontStyle: 'italic', marginLeft: '6px' }}>Nenhum fator de impacto ativado.</span>
            )}
          </div>

          {/* Providências adotadas pela Direção (exibido apenas se preenchido no banco) */}
          {form.providencias && (
            <div style={{ padding: '6px 8px', border: '1px dashed #dc2626', backgroundColor: '#fef2f2', borderRadius: '4px', fontSize: '9.5pt', marginBottom: '8px' }}>
              <strong style={{ color: '#dc2626' }}>Providências da Direção da AIP ({form.ripStatus}):</strong><br />
              <span style={{ whiteSpace: 'pre-wrap' }}>{form.providencias}</span>
              {form.observacoesAip && (
                <div style={{ marginTop: '4px', fontSize: '9pt', color: '#4b5563', borderTop: '1px solid #fee2e2', paddingTop: '4px' }}>
                  <strong>Observações Internas AIP:</strong> {form.observacoesAip}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Seção 11: Demandas para a AIP */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">11. Demandas para a AIP</div>
          <div style={{ padding: '4px 6px', textAlign: 'justify', whiteSpace: 'pre-wrap', minHeight: '40px' }}>
            {form.content.demandasAip || 'Nenhuma demanda de apoio institucional solicitada no período.'}
          </div>
        </div>

        {/* Seção 12: Observações Estratégicas ao Diretor de Inteligência */}
        <div style={{ display: 'block', breakInside: 'avoid', marginTop: '10px' }}>
          <div className="section-title">12. Observações Estratégicas ao Diretor de Inteligência</div>
          <div style={{ padding: '4px 6px', textAlign: 'justify', whiteSpace: 'pre-wrap', minHeight: '40px' }}>
            {form.content.observacoesDiretor || 'Nenhuma observação relevante registrada.'}
          </div>
        </div>

        {/* Declaração final (Aparece no print) */}
        <div className="print-only" style={{ marginTop: '24px', borderTop: '1px solid #000', paddingTop: '6px' }}>
          <p style={{ fontSize: '7.5pt', color: '#000', textAlign: 'justify', lineHeight: '1.2', margin: 0 }}>
            {LEGAL_TEXT}
          </p>
        </div>

      </div>
    </div>
  );
}
