'use client';

import { getClassificationColor, formatDate } from '@/lib/utils';
import { Download } from 'lucide-react';

interface Props {
  form: {
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
    };
  };
}

export function RelintPreview({ form }: Props) {
  const handlePrint = () => window.print();

  const classColors: Record<string, string> = {
    RESERVADO: '#d97706',
    CONFIDENCIAL: '#ea580c',
    SECRETO: '#dc2626',
    ULTRA_SECRETO: '#7c3aed',
  };

  const color = classColors[form.classification] || '#d97706';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Preview toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500">Pré-visualização do Documento</span>
        <button onClick={handlePrint}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 font-medium px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white transition-colors no-print">
          <Download className="w-3.5 h-3.5" /> Imprimir / PDF
        </button>
      </div>

      {/* Document */}
      <div className="p-8 relint-preview">
        {/* Classification header */}
        <div className="text-center mb-6">
          <span className="classification-stamp" style={{ color, borderColor: color }}>
            {form.classification.replace('_', ' ')}
          </span>
        </div>

        {/* Header */}
        <div className="text-center mb-8 border-b-2 border-gray-800 pb-6">
          <p className="font-bold text-sm uppercase">SECRETARIA DE ESTADO DA JUSTIÇA DE RONDÔNIA</p>
          <p className="font-bold text-sm uppercase">AGÊNCIA DE INTELIGÊNCIA PENAL</p>
          <p className="font-bold text-lg uppercase mt-1">AIP/SEJUS/RO</p>
        </div>

        {/* Identification */}
        <div className="mb-6 space-y-1">
          <p className="text-sm">
            <span className="font-bold underline">{form.number || 'RELINT Nº ___/20__/AIP/SEJUS/RO'}</span>
          </p>
          <p className="text-sm">
            <strong>Data:</strong> {form.date ? formatDate(new Date(form.date)) : '__/__/____'}
          </p>
          <p className="text-sm">
            <strong>Assunto:</strong> {form.subject || '___________________________________________'}
          </p>
          <p className="text-sm">
            <strong>Difusão:</strong> {form.diffusion || '___________________________________________'}
          </p>
        </div>

        {/* Separator */}
        <hr className="border-gray-400 mb-6" />

        {/* Content sections */}
        {form.content.introduction && (
          <div className="mb-6 text-justify text-sm leading-relaxed whitespace-pre-wrap">
            {form.content.introduction}
          </div>
        )}

        {form.content.body && (
          <div className="mb-6 text-justify text-sm leading-relaxed whitespace-pre-wrap">
            {form.content.body}
          </div>
        )}

        {form.content.conclusion && (
          <div className="mb-6">
            <p className="font-bold text-sm uppercase mb-2">Conclusão</p>
            <div className="text-justify text-sm leading-relaxed whitespace-pre-wrap">
              {form.content.conclusion}
            </div>
          </div>
        )}

        {form.content.recommendations && (
          <div className="mb-6">
            <p className="font-bold text-sm uppercase mb-2">Recomendações</p>
            <div className="text-justify text-sm leading-relaxed whitespace-pre-wrap">
              {form.content.recommendations}
            </div>
          </div>
        )}

        {/* Signature area */}
        <div className="mt-12 pt-6 border-t border-gray-300">
          <div className="flex justify-end">
            <div className="text-center">
              <div className="w-48 border-b border-gray-800 mb-1" />
              <p className="text-xs font-medium">Elaborado por</p>
              <p className="text-xs text-gray-500">Agência de Inteligência Penal</p>
            </div>
          </div>
        </div>

        {/* Classification footer */}
        <div className="text-center mt-6">
          <span className="classification-stamp text-xs" style={{ color, borderColor: color }}>
            {form.classification.replace('_', ' ')}
          </span>
        </div>

        {/* Legal disclaimer */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-[9px] text-gray-500 text-justify leading-tight">
            "O teor sigiloso deste documento é protegido e controlado pela Lei nº 12.527, de 18.11.2011,
            que restringe o acesso, a divulgação e o tratamento deste documento a pessoa devidamente
            credenciadas que tenham necessidade de conhecê-lo."
          </p>
        </div>
      </div>
    </div>
  );
}
