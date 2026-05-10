import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { existsSync } from 'fs';
import { join } from 'path';

const UPLOAD_ROOT = process.env.UPLOAD_DIR || '/app/uploads';
const PUBLIC_DIR = join(process.cwd(), 'public');

const CLASS_COLORS: Record<string, string> = {
  RESERVADO: '#b91c1c',
  CONFIDENCIAL: '#c2410c',
  SECRETO: '#991b1b',
  ULTRA_SECRETO: '#6d28d9',
};

const LEGAL_TEXT =
  '"O teor sigiloso deste documento é protegido e controlado pela Lei nº 12.527, de 18.11.2011, que restringe o acesso, a divulgação e o tratamento deste documento a pessoa devidamente credenciadas que tenham necessidade de conhecê-lo. A divulgação, a revelação, o fornecimento, a utilização ou a reprodução desautorizada das informações e conhecimentos utilizados, contidos ou veiculados por meio deste documento, a qualquer tempo, meio e modo, inclusive mediante acesso ou facilitação de acessos indevidos, caracterizam os crimes de violação de sigilo funcional ou de divulgação de segredo tipificados no Código Penal, bem como configuram condutas de improbidade administrativa."';

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function urlToFsPath(url?: string | null): string | null {
  if (!url) return null;
  let rel = '';
  if (url.startsWith('/api/uploads/')) rel = url.replace('/api/uploads/', '');
  else if (url.startsWith('/uploads/')) rel = url.replace('/uploads/', '');
  else return null;
  const p = join(UPLOAD_ROOT, rel);
  return existsSync(p) ? p : null;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 11, lineHeight: 1.5, color: '#000', paddingTop: 51, paddingBottom: 68, paddingLeft: 57, paddingRight: 57 },
  row: { flexDirection: 'row' },
  center: { alignItems: 'center' },
  hr: { borderBottomWidth: 1.5, borderBottomColor: '#000', marginVertical: 6 },
  hrLight: { borderBottomWidth: 1, borderBottomColor: '#666', marginBottom: 10 },
  field: { fontSize: 11, marginBottom: 3 },
  bold: { fontFamily: 'Helvetica-Bold' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 },
  para: { textAlign: 'justify', fontSize: 11, lineHeight: 1.6, marginBottom: 12 },
  footer: { position: 'absolute', bottom: 14, left: 57, right: 57, borderTopWidth: 1, borderTopColor: '#ccc', paddingTop: 4 },
  footerText: { fontSize: 7.5, color: '#333', textAlign: 'justify', lineHeight: 1.3 },
});

interface Block {
  type: string;
  content?: string;
  url?: string | null;
  caption?: string;
  align?: string;
  width?: number;
  imagePosition?: string;
  imageWidth?: number;
  text?: string;
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'text' && block.content) {
          const txt = block.content.trimStart().startsWith('<')
            ? stripHtml(block.content)
            : block.content;
          return <Text key={i} style={s.para}>{txt}</Text>;
        }

        if (block.type === 'image' && block.url) {
          const fsPath = urlToFsPath(block.url);
          if (!fsPath) return null;
          const pct = block.width || 100;
          const pw = (pct / 100) * 481;
          const align = block.align === 'left' ? 'flex-start' : block.align === 'right' ? 'flex-end' : 'center';
          return (
            <View key={i} style={{ marginBottom: 12, alignItems: align as any }}>
              <Image src={fsPath} style={{ width: pw }} />
              {block.caption && <Text style={{ fontSize: 8, color: '#555', marginTop: 2, textAlign: 'center' }}>{block.caption}</Text>}
            </View>
          );
        }

        if (block.type === 'row') {
          const fsPath = urlToFsPath(block.url);
          const imgW = block.imageWidth ?? 35;
          const total = 481;
          const imgPx = (imgW / 100) * total;
          const txtPx = total - imgPx - 10;
          const imgEl = fsPath ? (
            <View style={{ width: imgPx }}>
              <Image src={fsPath} style={{ width: imgPx }} />
              {block.caption && <Text style={{ fontSize: 8, color: '#555', marginTop: 2, textAlign: 'center' }}>{block.caption}</Text>}
            </View>
          ) : null;
          const txtEl = block.text ? (
            <Text style={{ width: txtPx, fontSize: 11, lineHeight: 1.6, textAlign: 'justify' }}>{block.text}</Text>
          ) : null;
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              {block.imagePosition === 'left' ? <>{imgEl}{txtEl}</> : <>{txtEl}{imgEl}</>}
            </View>
          );
        }

        return null;
      })}
    </>
  );
}

function Header() {
  const sejus = join(PUBLIC_DIR, 'logos', 'badge-sejus.png');
  const aip   = join(PUBLIC_DIR, 'logos', 'badge-aip.png');
  const pp    = join(PUBLIC_DIR, 'logos', 'badge-policia-penal.png');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <View style={{ width: 80, alignItems: 'center' }}>
        {existsSync(sejus) && <Image src={sejus} style={{ width: 72 }} />}
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, textTransform: 'uppercase', textAlign: 'center', marginBottom: 2 }}>SECRETARIA DE ESTADO DA JUSTIÇA DE RONDÔNIA</Text>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, textTransform: 'uppercase', textAlign: 'center', marginBottom: 2 }}>AGÊNCIA DE INTELIGÊNCIA PENAL</Text>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11, textTransform: 'uppercase', textAlign: 'center', marginBottom: 6 }}>AIP/SEJUS/RO</Text>
        {existsSync(aip) && <Image src={aip} style={{ width: 80 }} />}
      </View>
      <View style={{ width: 80, alignItems: 'center' }}>
        {existsSync(pp) && <Image src={pp} style={{ width: 72 }} />}
      </View>
    </View>
  );
}

function Stamp({ classification }: { classification: string }) {
  const color = CLASS_COLORS[classification] || '#b91c1c';
  const label = classification.replace('_', ' ');
  return (
    <View style={{ alignItems: 'center', marginBottom: 8 }}>
      <View style={{ borderWidth: 2, borderColor: color, paddingHorizontal: 18, paddingVertical: 2 }}>
        <Text style={{ color, fontFamily: 'Helvetica-Bold', fontSize: 12, letterSpacing: 2 }}>{label}</Text>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{LEGAL_TEXT}</Text>
    </View>
  );
}

/* ── RELINT ── */
export interface RelintForPDF {
  number: string;
  date: Date | string;
  subject: string;
  diffusion: string;
  classification: string;
  content: {
    body?: any;
    conclusion?: string;
    recommendations?: string;
    diffusionPrev?: string;
    reference?: string;
    annexes?: string;
  };
}

export function RelintPDFDocument({ relint }: { relint: RelintForPDF }) {
  const content = relint.content as any;
  const bodyBlocks: Block[] = typeof content?.body === 'string'
    ? (content.body ? [{ type: 'text', content: content.body }] : [])
    : (Array.isArray(content?.body) ? content.body : []);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Stamp classification={relint.classification} />
        <Header />
        <View style={s.hr} />

        <View style={{ marginBottom: 12 }}>
          <Text style={s.field}><Text style={s.bold}>{relint.number}</Text></Text>
          <Text style={s.field}><Text style={s.bold}>Data: </Text>{fmtDate(relint.date)}</Text>
          <Text style={s.field}><Text style={s.bold}>Assunto: </Text>{relint.subject}</Text>
          <Text style={s.field}><Text style={s.bold}>Difusão: </Text>{relint.diffusion}</Text>
          {content?.diffusionPrev && <Text style={s.field}><Text style={s.bold}>Difusão anterior: </Text>{content.diffusionPrev}</Text>}
          {content?.reference && <Text style={s.field}><Text style={s.bold}>Referência: </Text>{content.reference}</Text>}
          {content?.annexes && <Text style={s.field}><Text style={s.bold}>Anexo(s): </Text>{content.annexes}</Text>}
        </View>

        <View style={s.hrLight} />

        <Blocks blocks={bodyBlocks} />

        {content?.conclusion && (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.title}>Conclusão</Text>
            <Text style={s.para}>{content.conclusion}</Text>
          </View>
        )}
        {content?.recommendations && (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.title}>Recomendações</Text>
            <Text style={s.para}>{content.recommendations}</Text>
          </View>
        )}

        <Footer />
      </Page>
    </Document>
  );
}

/* ── DEBRIEFING ── */
export interface DebriefingForPDF {
  number: string;
  date: Date | string;
  missionDate?: Date | string | null;
  missionCode?: string | null;
  operationType?: string | null;
  operatives?: string | null;
  location?: string | null;
  subject: string;
  diffusion: string;
  classification: string;
  content: {
    body?: any;
    agentAssessment?: string;
    conclusions?: string;
    recommendations?: string;
  };
}

export function DebriefingPDFDocument({ debriefing }: { debriefing: DebriefingForPDF }) {
  const content = debriefing.content as any;
  const bodyBlocks: Block[] = typeof content?.body === 'string'
    ? (content.body ? [{ type: 'text', content: content.body }] : [])
    : (Array.isArray(content?.body) ? content.body : []);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Stamp classification={debriefing.classification} />
        <Header />
        <View style={s.hr} />

        <View style={{ alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 13, textTransform: 'uppercase' }}>Relatório de Debriefing</Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={s.field}><Text style={s.bold}>{debriefing.number}</Text></Text>
          <Text style={s.field}><Text style={s.bold}>Data: </Text>{fmtDate(debriefing.date)}</Text>
          {debriefing.missionDate && <Text style={s.field}><Text style={s.bold}>Data da Missão: </Text>{fmtDate(debriefing.missionDate)}</Text>}
          {debriefing.missionCode && <Text style={s.field}><Text style={s.bold}>Código da Missão: </Text>{debriefing.missionCode}</Text>}
          {debriefing.operationType && <Text style={s.field}><Text style={s.bold}>Tipo de Operação: </Text>{debriefing.operationType}</Text>}
          {debriefing.location && <Text style={s.field}><Text style={s.bold}>Local: </Text>{debriefing.location}</Text>}
          <Text style={s.field}><Text style={s.bold}>Assunto: </Text>{debriefing.subject}</Text>
          {debriefing.operatives && <Text style={s.field}><Text style={s.bold}>Policiais Envolvidos: </Text>{debriefing.operatives}</Text>}
          <Text style={s.field}><Text style={s.bold}>Difusão: </Text>{debriefing.diffusion}</Text>
        </View>

        <View style={s.hrLight} />

        <Blocks blocks={bodyBlocks} />

        {content?.agentAssessment && (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.title}>Avaliação do Agente</Text>
            <Text style={s.para}>{content.agentAssessment}</Text>
          </View>
        )}
        {content?.conclusions && (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.title}>Conclusões</Text>
            <Text style={s.para}>{content.conclusions}</Text>
          </View>
        )}
        {content?.recommendations && (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.title}>Recomendações</Text>
            <Text style={s.para}>{content.recommendations}</Text>
          </View>
        )}

        <Footer />
      </Page>
    </Document>
  );
}
