'use client';

import { useState, useEffect } from 'react';
import { formatDate } from '@/lib/utils';
import { Printer } from 'lucide-react';

interface FormData {
  number: string;
  date: string;
  subject: string;
  diffusion: string;
  classification: string;
  content: {
    introduction: string;
    body: string;
    conclusion: string;
    recommendations: string;
    diffusionPrev?: string;
    reference?: string;
    annexes?: string;
  };
}

interface Props {
  form: FormData;
}

const classColors: Record<string, string> = {
  RESERVADO: '#b91c1c',
  CONFIDENCIAL: '#c2410c',
  SECRETO: '#991b1b',
  ULTRA_SECRETO: '#6d28d9',
};

export function RelintPreview({ form }: Props) {
  const [badgeSizes, setBadgeSizes] = useState({ sejus: 72, aip: 80, policiaPenal: 72 });

  useEffect(() => {
    fetch('/api/relint-config')
      .then((r) => r.json())
      .then((d) => setBadgeSizes((prev) => ({ ...prev, ...d })))
      .catch(() => {});
  }, []);

  const handlePrint = () => window.print();
  const color = classColors[form.classification] || '#b91c1c';
  const classLabel = form.classification.replace('_', ' ');

  const diffusionPrev = form.content.diffusionPrev ?? '***';
  const reference = form.content.reference ?? '***';
  const annexes = form.content.annexes ?? '***';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow overflow-hidden">
      {/* Toolbar - não aparece na impressão */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100 no-print">
        <span className="text-xs font-medium text-gray-500">Pré-visualização — A4</span>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
        </button>
      </div>

      {/* Página A4 */}
      <div
        id="relint-print-area"
        className="relint-preview relative bg-white text-black"
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '11pt',
          lineHeight: '1.5',
          padding: '1.8cm 2cm 1.5cm',
          minHeight: '27cm',
          width: '100%',
        }}
      >
        {/* ── Carimbo de classificação topo ── */}
        <div className="text-center mb-3">
          <span
            style={{
              color,
              border: `2px solid ${color}`,
              fontWeight: 'bold',
              fontSize: '12pt',
              letterSpacing: '0.15em',
              padding: '2px 18px',
              display: 'inline-block',
            }}
          >
            {classLabel}
          </span>
        </div>

        {/* ── Cabeçalho 3 colunas ── */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          gap: '8px',
        }}>
          {/* Coluna esquerda – logo SEJUS */}
          <div style={{ width: badgeSizes.sejus + 8, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src="/logos/badge-sejus.png" alt="SEJUS"
              style={{ width: badgeSizes.sejus, height: 'auto' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>

          {/* Coluna central – texto institucional */}
          <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p style={{ fontWeight: 'bold', fontSize: '10pt', margin: '0 0 2px', textTransform: 'uppercase' }}>
              SECRETARIA DE ESTADO DA JUSTIÇA DE RONDÔNIA
            </p>
            <p style={{ fontWeight: 'bold', fontSize: '10pt', margin: '0 0 2px', textTransform: 'uppercase' }}>
              AGÊNCIA DE INTELIGÊNCIA PENAL
            </p>
            <p style={{ fontWeight: 'bold', fontSize: '12pt', margin: '2px 0 8px', textTransform: 'uppercase' }}>
              AIP/SEJUS/RO
            </p>
            <img src="/logos/badge-aip.png" alt="AIP/SEJUS/RO"
              style={{ width: badgeSizes.aip, height: 'auto' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>

          {/* Coluna direita – logo Polícia Penal */}
          <div style={{ width: badgeSizes.policiaPenal + 8, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src="/logos/badge-policia-penal.png" alt="Polícia Penal RO"
              style={{ width: badgeSizes.policiaPenal, height: 'auto' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        </div>

        {/* ── Linha separadora ── */}
        <hr style={{ borderTop: '1.5px solid #000', margin: '8px 0 10px' }} />

        {/* ── Campos de identificação ── */}
        <div style={{ marginBottom: '14px' }}>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}>
            <strong><u>{form.number || 'RELINT Nº___/20__/AIP/SEJUS/RO'}</u></strong>
          </p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}>
            <strong>Data:</strong>&nbsp;
            {form.date ? formatDate(new Date(form.date + 'T12:00:00')) : '__/__/____'}
          </p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}>
            <strong>Assunto:</strong>&nbsp;
            {form.subject || '_______________________________________________'}
          </p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}>
            <strong>Difusão:</strong>&nbsp;
            {form.diffusion || '_______________________________________________'}
          </p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}>
            <strong>Difusão anterior:</strong>&nbsp;{diffusionPrev}
          </p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}>
            <strong>Referência:</strong>&nbsp;{reference}
          </p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}>
            <strong>Anexo(s):</strong>{annexes}
          </p>
        </div>

        {/* ── Linha separadora ── */}
        <hr style={{ borderTop: '1px solid #666', margin: '0 0 14px' }} />

        {/* ── Conteúdo do documento ── */}
        <div style={{ flex: 1 }}>
          {form.content.introduction && (
            <div
              style={{
                textAlign: 'justify',
                fontSize: '11pt',
                lineHeight: '1.6',
                marginBottom: '12px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {form.content.introduction}
            </div>
          )}

          {form.content.body && (
            <div
              style={{
                textAlign: 'justify',
                fontSize: '11pt',
                lineHeight: '1.6',
                marginBottom: '12px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {form.content.body}
            </div>
          )}

          {form.content.conclusion && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontWeight: 'bold', fontSize: '11pt', textTransform: 'uppercase', marginBottom: '4px' }}>
                Conclusão
              </p>
              <div
                style={{
                  textAlign: 'justify',
                  fontSize: '11pt',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {form.content.conclusion}
              </div>
            </div>
          )}

          {form.content.recommendations && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontWeight: 'bold', fontSize: '11pt', textTransform: 'uppercase', marginBottom: '4px' }}>
                Recomendações
              </p>
              <div
                style={{
                  textAlign: 'justify',
                  fontSize: '11pt',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {form.content.recommendations}
              </div>
            </div>
          )}
        </div>

        {/* ── Carimbo de classificação rodapé ── */}
        <div style={{ textAlign: 'center', marginTop: '30px', marginBottom: '10px' }}>
          <span
            style={{
              color,
              border: `2px solid ${color}`,
              fontWeight: 'bold',
              fontSize: '11pt',
              letterSpacing: '0.15em',
              padding: '2px 18px',
              display: 'inline-block',
            }}
          >
            {classLabel}
          </span>
        </div>

        {/* ── Aviso legal ── */}
        <div style={{ borderTop: '1px solid #ccc', paddingTop: '8px', marginTop: '4px' }}>
          <p
            style={{
              fontSize: '7.5pt',
              color: '#333',
              textAlign: 'justify',
              lineHeight: '1.3',
              margin: 0,
            }}
          >
            "O teor sigiloso deste documento é protegido e controlado pela Lei nº 12.527, de 18.11.2011,
            que restringe o acesso, a divulgação e o tratamento deste documento a pessoa devidamente
            credenciadas que tenham necessidade de conhecê-lo. A divulgação, a revelação, o fornecimento,
            a utilização ou a reprodução desautorizada das informações e conhecimentos utilizados, contidos
            ou veiculados por meio deste documento, a qualquer tempo, meio e modo, inclusive mediante acesso
            ou facilitação de acessos indevidos, caracterizam os crimes de violação de sigilo funcional ou
            de divulgação de segredo tipificados no Código Penal, bem como configuram condutas de
            improbidade administrativa."
          </p>
        </div>
      </div>
    </div>
  );
}
