'use client';

import { useState, useEffect, useRef } from 'react';
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
    body: any; // string (legacy) | Block[]
    conclusion: string;
    recommendations: string;
    diffusionPrev?: string;
    reference?: string;
    annexes?: string;
  };
}

interface Props { form: FormData; }

const classColors: Record<string, string> = {
  RESERVADO: '#b91c1c',
  CONFIDENCIAL: '#c2410c',
  SECRETO: '#991b1b',
  ULTRA_SECRETO: '#6d28d9',
};

function buildPrintHtml(
  contentHtml: string,
  title: string,
  color: string,
  classLabel: string
): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #000;
    background: white;
    padding: 1.8cm 2cm 1.5cm;
    margin: 0;
    width: 210mm;
    min-height: 297mm;
  }
  img { max-width: 100%; }
  p { margin: 0 0 3px; }
  hr { border: none; border-top: 1.5px solid #000; margin: 8px 0 10px; }
</style>
</head>
<body>${contentHtml}<script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}<\/script></body>
</html>`;
}

export function RelintPreview({ form }: Props) {
  const [badgeSizes, setBadgeSizes] = useState({ sejus: 72, aip: 80, policiaPenal: 72 });
  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/relint-config')
      .then((r) => r.json())
      .then((d) => setBadgeSizes((prev) => ({ ...prev, ...d })))
      .catch(() => {});
  }, []);

  const handlePrint = () => {
    const html = printAreaRef.current?.innerHTML;
    if (!html) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Permita pop-ups para imprimir.'); return; }
    win.document.write(buildPrintHtml(html, form.number, color, classLabel));
    win.document.close();
  };

  const color = classColors[form.classification] || '#b91c1c';
  const classLabel = form.classification.replace('_', ' ');
  const diffusionPrev = form.content.diffusionPrev ?? '***';
  const reference = form.content.reference ?? '***';
  const annexes = form.content.annexes ?? '***';

  const bodyBlocks: Array<{ type: string; id?: string; content?: string; url?: string; caption?: string }> =
    typeof form.content.body === 'string'
      ? (form.content.body ? [{ type: 'text', content: form.content.body }] : [])
      : (Array.isArray(form.content.body) ? form.content.body : []);

  /* ── Estilos reutilizados ── */
  const stamp = {
    color,
    border: `2px solid ${color}`,
    fontWeight: 'bold' as const,
    fontSize: '12pt',
    letterSpacing: '0.15em',
    padding: '2px 18px',
    display: 'inline-block',
  };
  const para = { textAlign: 'justify' as const, fontSize: '11pt', lineHeight: '1.6', marginBottom: '12px', whiteSpace: 'pre-wrap' as const };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500">Pré-visualização — A4</span>
        <button onClick={handlePrint}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
        </button>
      </div>

      {/* Documento A4 */}
      <div ref={printAreaRef} className="bg-white text-black"
        style={{ fontFamily: 'Arial, sans-serif', fontSize: '11pt', lineHeight: '1.5', padding: '1.8cm 2cm 1.5cm', minHeight: '27cm', width: '100%' }}>

        {/* Carimbo topo */}
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <span style={stamp}>{classLabel}</span>
        </div>

        {/* Cabeçalho 3 colunas */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' }}>
          <div style={{ width: badgeSizes.sejus + 8, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src="/logos/badge-sejus.png" alt="SEJUS" style={{ width: badgeSizes.sejus, height: 'auto' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p style={{ fontWeight: 'bold', fontSize: '10pt', margin: '0 0 2px', textTransform: 'uppercase' }}>SECRETARIA DE ESTADO DA JUSTIÇA DE RONDÔNIA</p>
            <p style={{ fontWeight: 'bold', fontSize: '10pt', margin: '0 0 2px', textTransform: 'uppercase' }}>AGÊNCIA DE INTELIGÊNCIA PENAL</p>
            <p style={{ fontWeight: 'bold', fontSize: '12pt', margin: '2px 0 8px', textTransform: 'uppercase' }}>AIP/SEJUS/RO</p>
            <img src="/logos/badge-aip.png" alt="AIP/SEJUS/RO" style={{ width: badgeSizes.aip, height: 'auto' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div style={{ width: badgeSizes.policiaPenal + 8, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src="/logos/badge-policia-penal.png" alt="Polícia Penal RO" style={{ width: badgeSizes.policiaPenal, height: 'auto' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        </div>

        <hr style={{ margin: '8px 0 10px', borderTop: '1.5px solid #000', borderBottom: 'none', borderLeft: 'none', borderRight: 'none' }} />

        {/* Campos */}
        <div style={{ marginBottom: '14px' }}>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}><strong><u>{form.number || 'RELINT Nº___/20__/AIP/SEJUS/RO'}</u></strong></p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}><strong>Data:</strong>&nbsp;{form.date ? formatDate(new Date(form.date + 'T12:00:00')) : '__/__/____'}</p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}><strong>Assunto:</strong>&nbsp;{form.subject || '_______________'}</p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}><strong>Difusão:</strong>&nbsp;{form.diffusion || '_______________'}</p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}><strong>Difusão anterior:</strong>&nbsp;{diffusionPrev}</p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}><strong>Referência:</strong>&nbsp;{reference}</p>
          <p style={{ margin: '0 0 3px', fontSize: '11pt' }}><strong>Anexo(s):</strong>&nbsp;{annexes}</p>
        </div>

        <hr style={{ margin: '0 0 14px', borderTop: '1px solid #666', borderBottom: 'none', borderLeft: 'none', borderRight: 'none' }} />

        {/* Conteúdo */}
        {form.content.introduction && <div style={para}>{form.content.introduction}</div>}

        {/* Corpo do relatório — blocos de texto e imagens intercalados */}
        {bodyBlocks.map((block, i) =>
          block.type === 'text' ? (
            block.content ? <div key={i} style={para}>{block.content}</div> : null
          ) : (
            <div key={i} style={{ marginBottom: '14px', textAlign: 'center' }}>
              <img src={block.url} alt={block.caption || `Imagem ${i + 1}`}
                style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain' }} />
              {block.caption && (
                <p style={{ fontSize: '8pt', color: '#555', marginTop: '4px', textAlign: 'center' }}>
                  {block.caption}
                </p>
              )}
            </div>
          )
        )}

        {form.content.conclusion && (
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontWeight: 'bold', fontSize: '11pt', textTransform: 'uppercase', marginBottom: '4px' }}>Conclusão</p>
            <div style={para}>{form.content.conclusion}</div>
          </div>
        )}
        {form.content.recommendations && (
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontWeight: 'bold', fontSize: '11pt', textTransform: 'uppercase', marginBottom: '4px' }}>Recomendações</p>
            <div style={para}>{form.content.recommendations}</div>
          </div>
        )}

        {/* Carimbo rodapé */}
        <div style={{ textAlign: 'center', marginTop: '30px', marginBottom: '10px' }}>
          <span style={{ ...stamp, fontSize: '11pt' }}>{classLabel}</span>
        </div>

        {/* Aviso legal */}
        <div style={{ borderTop: '1px solid #ccc', paddingTop: '8px' }}>
          <p style={{ fontSize: '7.5pt', color: '#333', textAlign: 'justify', lineHeight: '1.3', margin: 0 }}>
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
