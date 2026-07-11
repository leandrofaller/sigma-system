import { AIPApenado } from './AIPanel'

// Lógica de ajuda para gerar o código de barras em SVG puro
function generateBarcodeSvg(text: string): string {
  const linesCount = 45
  let rects = ''
  let x = 0
  for (let i = 0; i < linesCount; i++) {
    const w = (i % 3 === 0 || i % 7 === 0) ? 2 : 1
    const spacing = (i % 4 === 0) ? 2 : 1
    rects += `<rect x="${x}" y="2" width="${w}" height="24" fill="#0f172a" />`
    x += w + spacing
  }
  return `<svg width="${x}" height="32" viewBox="0 0 ${x} 32" xmlns="http://www.w3.org/2000/svg">
    ${rects}
    <text x="${x / 2}" y="31" font-family="monospace" font-size="7" fill="#475569" text-anchor="middle">*${text}*</text>
  </svg>`
}

// Lógica de conversão de imagens/logos para Base64 Data URI
async function toDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject()
      reader.readAsDataURL(blob)
    });
  } catch {
    return null
  }
}

const LEGAL_TEXT =
  'O teor sigiloso deste documento é protegido e controlado pela Lei nº 12.527, de 18.11.2011, que restringe o acesso, a divulgação e o tratamento deste documento a pessoas devidamente credenciadas que tenham necessidade de conhecê-lo. A divulgação, a revelação, o fornecimento, a utilização ou a reprodução desautorizada das informações e conhecimentos utilizados, contidos ou veiculados por meio deste documento, a qualquer tempo, meio e modo, inclusive mediante acesso ou facilitação de acessos indevidos, caracterizam os crimes de violação de sigilo funcional ou de divulgação de segredo tipificados no Código Penal, bem como configuram condutas de improbidade administrativa.'

function generateOperatorCode(email: string): string {
  if (!email) return 'OP-DESCONHECIDO'
  let hash = 0
  const str = email.toLowerCase().trim()
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')
  return `OP-${hex.slice(0, 8)}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function printAIPDossier(
  apenado: AIPApenado,
  userEmail?: string | null,
  userRole?: string | null,
  layout?: any
): Promise<void> {
  const opCode = generateOperatorCode(userEmail || '')
  const operatorText = opCode

  // Configuração da marca d'água
  const watermarkGlobal = layout?.watermark
  const watermarkEnabled = layout?.watermarkEnabled && watermarkGlobal?.enabled !== false && !!layout?.watermarkText
  
  let watermarkCss = ''
  let watermarkHtml = ''
  
  if (watermarkEnabled) {
    const text = escapeHtml(layout.watermarkText)
    const fontSize = watermarkGlobal?.fontSize || 60
    const color = watermarkGlobal?.color || '#cbd5e1'
    const opacity = watermarkGlobal?.opacity || 0.15
    const rotation = watermarkGlobal?.rotation ?? -45
    const position = watermarkGlobal?.position || 'repeat'
    
    if (position === 'repeat') {
      const gridSpacing = watermarkGlobal?.gridSpacing || 300
      const width = gridSpacing
      const height = Math.round(gridSpacing * (2 / 3))
      const x = Math.round(width / 2)
      const y = Math.round(height / 2)
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color}" opacity="${opacity}" transform="rotate(${rotation}, ${x}, ${y})" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`
      const svgBase64 = typeof window !== 'undefined' ? btoa(unescape(encodeURIComponent(svgString))) : ''
      watermarkCss = `
        .watermark-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 9999;
          background-image: url("data:image/svg+xml;base64,${svgBase64}");
          background-repeat: repeat;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `
      watermarkHtml = `<div class="watermark-overlay"></div>`
    } else {
      watermarkCss = `
        .watermark-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .watermark-text {
          font-family: Arial, sans-serif;
          font-size: ${fontSize}px;
          font-weight: bold;
          color: ${color};
          opacity: ${opacity};
          transform: rotate(${rotation}deg);
          white-space: nowrap;
        }
      `
      watermarkHtml = `<div class="watermark-overlay"><span class="watermark-text">${text}</span></div>`
    }
  }

  // 1. Converter fotos e logotipos para Base64 para evitar problemas de CORS/sessão
  const [photoUri, aipLogo, ppLogo] = await Promise.all([
    apenado.photoPath ? toDataUri(`/api/aip/apenados/${apenado.id}/foto`) : Promise.resolve(null),
    toDataUri('/logos/badge-aip.png'),
    toDataUri('/logos/badge-policia-penal.png')
  ])

  // Converter fotos dos visitantes para Base64
  const visitorPhotos: Record<string, string> = {}
  if (apenado.fotoVisitantes && apenado.fotoVisitantes.length > 0) {
    await Promise.all(
      apenado.fotoVisitantes.map(async (v) => {
        if (v.photoPath && v.visitanteId) {
          const uri = await toDataUri(`/api/sipe/visitantes/${v.visitanteId}/foto`)
          if (uri) {
            visitorPhotos[v.id] = uri
          }
        }
      })
    )
  }

  // 1.2 Buscar vínculos (relacionados) do apenado no sistema
  let vinculos: any[] = []
  const linkedPhotos: Record<string, string> = {}
  try {
    const vinculosRes = await fetch(`/api/aip/vinculos?sipeId=${apenado.sipeId}`)
    if (vinculosRes.ok) {
      const data = await vinculosRes.json()
      vinculos = data.vinculos || []
    }
  } catch (err) {
    console.error('Erro ao buscar vínculos para o relatório:', err)
  }

  // Converter fotos dos vinculados para Base64
  if (vinculos.length > 0) {
    await Promise.all(
      vinculos.map(async (v) => {
        if (v.outroApenado && v.outroApenado.id && v.outroApenado.photoPath) {
          const uri = await toDataUri(`/api/aip/apenados/${v.outroApenado.id}/foto`)
          if (uri) {
            linkedPhotos[v.outroApenado.id] = uri
          }
        }
      })
    )
  }

  // Determinar rótulos e cores com base no nível de facção
  const faccaoNome = apenado.facaoRealNome || apenado.faccao || 'NÃO CONSTATADO'
  const isFaccaoConfirmada = apenado.facaoRealNome && apenado.facaoNivel === 'confirmado'
  
  let classificationLabel = 'RESERVADO // INTERNO'
  let stampBorderColor = '#475569'
  let stampTextColor = '#1e293b'
  let stampBgColor = '#f1f5f9'

  if (isFaccaoConfirmada) {
    classificationLabel = 'RESERVADO'
    stampBorderColor = '#991b1b'
    stampTextColor = '#ffffff'
    stampBgColor = '#991b1b'
  } else if (apenado.facaoRealNome) {
    classificationLabel = 'RESERVADO // INFORMAÇÃO DE INTELIGÊNCIA'
    stampBorderColor = '#b45309'
    stampTextColor = '#ffffff'
    stampBgColor = '#b45309'
  }

  const barcodeSvg = generateBarcodeSvg(apenado.rji || String(apenado.sipeId))

  // 1.3 Obter configurações do layout da foto e seções
  const photoFit = layout?.photoFit || 'cover-top'
  const defaultSections = [
    { id: 'dados_pessoais', title: 'Dados Pessoais (SIPE)', visible: true },
    { id: 'situacao_prisional', title: 'Situação Prisional (SIPE)', visible: true },
    { id: 'endereco_residencial', title: 'Endereço Residencial (SIPE)', visible: true },
    { id: 'advogados', title: 'Advogados (SIPE)', visible: true },
    { id: 'dados_inteligencia', title: 'Dados de Inteligência', visible: false },
    { id: 'visitantes', title: 'Visitantes Cadastrados', visible: true },
    { id: 'vinculos', title: 'Vínculos no Sistema', visible: true }
  ];

  let activeSections = layout?.sections || defaultSections;
  const existingIds = new Set(activeSections.map((s: any) => s.id));
  const missingSections = defaultSections.filter(s => !existingIds.has(s.id));
  if (missingSections.length > 0) {
    activeSections = [...activeSections, ...missingSections];
  }

  function toRoman(num: number): string {
    const romanMap = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return romanMap[num - 1] || String(num);
  }

  const getSectionTitle = (id: string, defaultTitle: string) => {
    const section = activeSections.find((s: any) => s.id === id);
    return section?.title || defaultTitle;
  };

  const sectionRenders: Record<string, () => string> = {
    dados_pessoais: () => `
      <div class="avoid-break" style="margin-top: 15px;">
        <div class="section-header">__ROMAN__. ${getSectionTitle('dados_pessoais', 'DADOS CADASTRAIS (BASE SIPE)')}</div>
        <table class="info-table">
          <tr>
            <td style="width: 25%;">
              <div class="info-label">SIPE ID</div>
              <div class="info-value">#${apenado.sipeId}</div>
            </td>
            <td style="width: 25%;">
              <div class="info-label">RJI</div>
              <div class="info-value">${apenado.rji || '—'}</div>
            </td>
            <td style="width: 25%;">
              <div class="info-label">CPF</div>
              <div class="info-value">${apenado.cpf || '—'}</div>
            </td>
            <td style="width: 25%;">
              <div class="info-label">RG / Órgão Expedidor</div>
              <div class="info-value">${apenado.rg || '—'}${apenado.rgOrgao ? ` / ${apenado.rgOrgao}` : ''}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div class="info-label">Data de Nascimento</div>
              <div class="info-value">${apenado.dataNascimento || '—'}</div>
            </td>
            <td>
              <div class="info-label">Sexo</div>
              <div class="info-value">${apenado.sexo || '—'}</div>
            </td>
            <td>
              <div class="info-label">Etnia / Cor</div>
              <div class="info-value">${apenado.etnia || '—'}</div>
            </td>
            <td>
              <div class="info-label">Tipo Sanguíneo</div>
              <div class="info-value">${apenado.tipoSanguineo || '—'}</div>
            </td>
          </tr>
          <tr>
            <td colspan="2">
              <div class="info-label">Naturalidade / UF</div>
              <div class="info-value">${apenado.naturalidade || '—'}</div>
            </td>
            <td>
              <div class="info-label">Estado Civil</div>
              <div class="info-value">${apenado.estadoCivil || '—'}</div>
            </td>
            <td>
              <div class="info-label">Telefone Cadastrado</div>
              <div class="info-value">${apenado.telefone || '—'}</div>
            </td>
          </tr>
          <tr>
            <td colspan="2">
              <div class="info-label">Nome da Mãe</div>
              <div class="info-value">${apenado.nomeMae ? apenado.nomeMae.toUpperCase() : '—'}</div>
            </td>
            <td colspan="2">
              <div class="info-label">Nome do Pai</div>
              <div class="info-value">${apenado.nomePai ? apenado.nomePai.toUpperCase() : '—'}</div>
            </td>
          </tr>
          ${
            apenado.nomeConjuge
              ? `<tr>
                  <td colspan="3">
                    <div class="info-label">Cônjuge / Companheiro(a)</div>
                    <div class="info-value">${apenado.nomeConjuge.toUpperCase()}</div>
                  </td>
                  <td>
                    <div class="info-label">Filhos Cadastrados</div>
                    <div class="info-value">${apenado.qtdFilhos ?? 0}</div>
                  </td>
                 </tr>`
              : ''
          }
        </table>
      </div>
    `,
    situacao_prisional: () => `
      <div class="avoid-break" style="margin-top: 15px;">
        <div class="section-header">__ROMAN__. ${getSectionTitle('situacao_prisional', 'SITUAÇÃO PRISIONAL E CUSTÓDIA')}</div>
        <table class="info-table">
          <tr>
            <td style="width: 50%;">
              <div class="info-label font-bold">Unidade de Custódia Atual</div>
              <div class="info-value" style="color: #1e3a8a;">${apenado.unidade || 'NÃO INFORMADA'}</div>
            </td>
            <td style="width: 25%;">
              <div class="info-label">Cela</div>
              <div class="info-value">${apenado.cela || '—'}</div>
            </td>
            <td style="width: 25%;">
              <div class="info-label">Situação do Apenado</div>
              <div class="info-value">${apenado.situacao || '—'}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div class="info-label">Regime Atual</div>
              <div class="info-value">${apenado.regime || '—'}</div>
            </td>
            <td>
              <div class="info-label">Data de Entrada na Unidade</div>
              <div class="info-value">${apenado.dataEntrada || '—'}</div>
            </td>
            <td>
              <div class="info-label">Tempo de Pena</div>
              <div class="info-value">${apenado.tempoPena || '—'}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div class="info-label">Monitoramento Eletrônico (Tornozeleira)</div>
              <div class="info-value">${apenado.monitorado === true ? 'SIM (MONITORADO)' : apenado.monitorado === false ? 'NÃO' : '—'}</div>
            </td>
            <td>
              <div class="info-label">Intramuro</div>
              <div class="info-value">${apenado.intramuro === true ? 'SIM' : apenado.intramuro === false ? 'NÃO' : '—'}</div>
            </td>
            <td>
              <div class="info-label">Preso Oriundo</div>
              <div class="info-value">${apenado.presoOriundo || '—'}</div>
            </td>
          </tr>
        </table>
      </div>
    `,
    endereco_residencial: () => {
      if (!(apenado.logradouro || apenado.cidade || apenado.cep)) return '';
      return `
        <div class="avoid-break" style="margin-top: 15px;">
          <div class="section-header">__ROMAN__. ${getSectionTitle('endereco_residencial', 'ENDEREÇO RESIDENCIAL DECLARADO')}</div>
          <table class="info-table">
            <tr>
              <td style="width: 60%;">
                <div class="info-label">Logradouro / Número / Complemento</div>
                <div class="info-value">
                  ${apenado.logradouro || ''}
                  ${apenado.numero ? `, Nº ${apenado.numero}` : ''}
                  ${apenado.complemento ? ` - ${apenado.complemento}` : ''}
                </div>
              </td>
              <td style="width: 20%;">
                <div class="info-label">Bairro</div>
                <div class="info-value">${apenado.bairro || '—'}</div>
              </td>
              <td style="width: 20%;">
                <div class="info-label">CEP</div>
                <div class="info-value">${apenado.cep || '—'}</div>
              </td>
            </tr>
            <tr>
              <td colspan="3">
                <div class="info-label">Cidade / UF</div>
                <div class="info-value">${apenado.cidade || '—'}${apenado.uf ? ` / ${apenado.uf}` : ''}</div>
              </td>
            </tr>
          </table>
        </div>
      `;
    },
    dados_inteligencia: () => `
      <div class="avoid-break" style="margin-top: 15px;">
        <div class="section-header">__ROMAN__. ${getSectionTitle('dados_inteligencia', 'NOTAS E ANÁLISE DE INTELIGÊNCIA')}</div>
        <div class="notes-box">${apenado.notasInteligencia || 'Nenhum registro de inteligência inserido para este apenado.'}</div>
        ${
          apenado.observacoes
            ? `
            <div style="font-family:'Courier New', Courier, monospace; font-size:7.5pt; color:#475569; font-weight:bold; margin-bottom: 2px;">OBSERVAÇÕES ADICIONAIS DE CAMPO</div>
            <div class="notes-box" style="border-left-color: #b45309; min-height: 40px; margin-bottom: 15px;">${apenado.observacoes}</div>
            `
            : ''
        }
      </div>
    `,
    advogados: () => `
      <div class="avoid-break" style="margin-top: 15px;">
        <div class="section-header">__ROMAN__. ${getSectionTitle('advogados', 'VÍNCULOS JURÍDICOS DE DEFESA (ADVOGADOS CADASTRADOS)')}</div>
        ${
          apenado.sipeApenado?.vinculosAdvogado && apenado.sipeApenado.vinculosAdvogado.length > 0
            ? `
            <div class="advocates-list">
              ${apenado.sipeApenado.vinculosAdvogado
                .map(
                  (v) => `
                <div class="advocate-item">
                  <span>${v.advogado.nome.toUpperCase()}</span>
                  <span class="advocate-oab">OAB: ${v.advogado.oab || 'NÃO INFORMADA'}</span>
                </div>
              `
                )
                .join('')}
            </div>
            `
            : '<div style="font-size: 8.5pt; color: #64748b; padding: 6px 10px; border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 4px;">Nenhum advogado vinculado nas bases do SIPE.</div>'
        }
      </div>
    `,
    visitantes: () => `
      <div class="avoid-break" style="margin-top: 15px;">
        <div class="section-header">__ROMAN__. ${getSectionTitle('visitantes', 'VÍNCULOS DE CONTATO E VISITANTES CADASTRADOS')}</div>
        ${
          apenado.fotoVisitantes && apenado.fotoVisitantes.length > 0
            ? `
            <div class="visitors-grid">
              ${apenado.fotoVisitantes
                .map((v) => {
                  const visitorPhotoUri = visitorPhotos[v.id]
                  const statusClass = v.ativoVisitante ? 'status-active' : 'status-inactive'
                  const statusText = v.ativoVisitante ? 'Ativo' : 'Inativo'

                  return `
                  <div class="visitor-card">
                    <div class="visitor-photo">
                      ${
                        visitorPhotoUri
                          ? `<img src="${visitorPhotoUri}" alt="Visitante" />`
                          : `<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.2" style="width: 24px; height: 24px;">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                             </svg>`
                      }
                    </div>
                    <div class="visitor-info">
                      <div class="visitor-name" style="border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin-bottom: 4px;" title="${v.nomeVisitante || '—'}">${v.nomeVisitante || '—'}</div>
                      <div>
                        <span class="visitor-status ${statusClass}">${statusText}</span>
                      </div>
                      <div class="visitor-meta">Parentesco: <strong>${v.parentescoVisitante || '—'}</strong></div>
                      <div class="visitor-meta">CPF: ${v.cpfVisitante || '—'}</div>
                    </div>
                  </div>
                `
                })
                .join('')}
            </div>
            `
            : '<div style="font-size: 8.5pt; color: #64748b; padding: 6px 10px; border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 4px;">Nenhum visitante cadastrado para este apenado.</div>'
        }
      </div>
    `,
    vinculos: () => `
      <div class="avoid-break" style="margin-top: 15px;">
        <div class="section-header">__ROMAN__. ${getSectionTitle('vinculos', 'VÍNCULOS E ASSOCIAÇÕES DETECTADAS NO SISTEMA')}</div>
        ${
          vinculos.length > 0
            ? `
            <div class="visitors-grid">
              ${vinculos
                .map((v) => {
                  if (!v.outroApenado) return ''
                  const outroPhotoUri = linkedPhotos[v.outroApenado.id]
                  const forcaLabel = v.forca === 'confirmado' ? 'Confirmado' : 'Suspeita'
                  const statusClass = v.forca === 'confirmado' ? 'status-active' : 'status-inactive'

                  return `
                  <div class="visitor-card">
                    <div class="visitor-photo">
                      ${
                        outroPhotoUri
                          ? `<img src="${outroPhotoUri}" alt="Foto" />`
                          : `<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.2" style="width: 24px; height: 24px;">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                             </svg>`
                      }
                    </div>
                    <div class="visitor-info">
                      <div class="visitor-name" style="font-size: 9.5pt; font-weight: 800; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin-bottom: 4px;" title="${v.outroApenado.nome || ''}">
                        ${v.outroApenado.nome.toUpperCase()}
                      </div>
                      <div>
                        <span class="visitor-status ${statusClass}">${v.tipo.toUpperCase()} (${forcaLabel.toUpperCase()})</span>
                      </div>
                      <div class="visitor-meta">SIPE ID: <strong>#${v.outroApenado.sipeId}</strong> · Facção: <strong style="color: #b91c1c;">${(v.outroApenado.facaoRealNome || 'NÃO CONSTATADO').toUpperCase()}</strong></div>
                      <div class="visitor-meta">Custódia: ${v.outroApenado.unidade || 'NÃO INFORMADA'} - Cela: ${v.outroApenado.cela || '—'}</div>
                      ${
                        v.notaVinculo
                          ? `<div class="visitor-meta" style="font-style: italic; color: #475569; margin-top: 3px; background: #f8fafc; padding: 2px 4px; border-left: 2px solid #cbd5e1; word-break: break-all;">Obs: ${v.notaVinculo}</div>`
                          : ''
                      }
                    </div>
                  </div>
                `
                })
                .join('')}
            </div>
            `
            : '<div style="font-size: 8.5pt; color: #64748b; padding: 6px 10px; border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 4px;">Nenhum outro apenado vinculado a este registro no sistema.</div>'
        }
      </div>
    `
  };

  let visibleIndex = 0;
  const sectionsHtml = activeSections
    .filter((s: any) => s.visible)
    .map((s: any) => {
      const render = sectionRenders[s.id];
      if (!render) return '';
      const htmlContent = render();
      if (!htmlContent) return '';
      visibleIndex++;
      const roman = toRoman(visibleIndex);
      return htmlContent.replace('__ROMAN__', roman);
    })
    .join('\n');

  // Renderizar o layout HTML premium
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Qualificação de Apenado - ${apenado.nome.toUpperCase()}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 1.2cm 1.5cm 1.2cm 1.5cm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      width: 100%;
    }
    
    /* Cabeçalho AIP */
    .header-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
    }
    .header-logo-aip {
      width: 80px;
      height: auto;
      object-fit: contain;
    }
    .header-logo-pp {
      width: 100px;
      height: auto;
      object-fit: contain;
    }
    .header-text {
      flex: 1;
      text-align: center;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      padding: 0 10px;
    }
    .header-text h1 {
      font-size: 9.5pt;
      font-weight: bold;
      margin: 0 0 2px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .header-text h2 {
      font-size: 9pt;
      font-weight: bold;
      margin: 0 0 2px 0;
      text-transform: uppercase;
      color: #334155;
    }
    .header-text h3 {
      font-size: 10.5pt;
      font-weight: bold;
      margin: 4px 0 0 0;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #0f172a;
    }

    /* Carimbos e Metadados do Topo */
    .meta-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      gap: 15px;
    }
    .classification-stamp {
      border: 2px solid ${stampBorderColor};
      background-color: ${stampBgColor};
      color: ${stampTextColor};
      font-family: Arial, sans-serif;
      font-weight: bold;
      font-size: 9.5pt;
      letter-spacing: 1.5px;
      padding: 5px 16px;
      text-transform: uppercase;
      text-align: center;
      border-radius: 4px;
    }
    .barcode-container {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    /* Títulos de Seções */
    .section-header {
      font-family: 'Courier New', Courier, monospace;
      font-size: 9.5pt;
      font-weight: bold;
      background-color: #1e293b;
      color: #ffffff;
      padding: 5px 10px;
      margin-top: 18px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
      display: flex;
      justify-content: space-between;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Grid de Informações */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      border: 1px solid #94a3b8;
    }
    .info-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      vertical-align: top;
    }
    .info-label {
      font-family: 'Courier New', Courier, monospace;
      font-size: 7.5pt;
      color: #475569;
      text-transform: uppercase;
      margin-bottom: 3px;
      font-weight: bold;
    }
    .info-value {
      font-size: 9pt;
      font-weight: bold;
      color: #0f172a;
    }
    .info-value.faccao-highlight {
      color: ${isFaccaoConfirmada ? '#b91c1c' : '#b45309'};
      font-size: 10pt;
    }

    /* Seção de Perfil Principal (Foto + Dados Chave) */
    .profile-section {
      display: flex;
      gap: 15px;
      margin-bottom: 12px;
      align-items: stretch;
    }
    
    /* Caixa da Foto do Alvo */
    .photo-wrapper {
      position: relative;
      width: 140px;
      height: 180px;
      border: 2px solid #0f172a;
      background-color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .photo-img {
      width: 100%;
      height: 100%;
      object-fit: ${photoFit === 'contain' ? 'contain' : 'cover'};
      ${photoFit === 'cover-top' ? 'object-position: top;' : ''}
    }
    /* Cantoneiras Táticas estilo Alvo */
    .tactical-corner {
      position: absolute;
      width: 14px;
      height: 14px;
      border: 3px solid ${isFaccaoConfirmada ? '#b91c1c' : '#475569'};
      pointer-events: none;
    }
    .corner-tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; }
    .corner-tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; }
    .corner-bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; }
    .corner-br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; }

    .photo-fallback {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: #64748b;
    }
    .photo-fallback svg {
      width: 50px;
      height: 50px;
      margin-bottom: 5px;
    }
    .photo-fallback span {
      font-size: 7.5pt;
      text-transform: uppercase;
      font-family: monospace;
    }

    .profile-details-table {
      flex: 1;
      margin-bottom: 0;
    }

    /* Notas de Inteligência */
    .notes-box {
      font-size: 9pt;
      line-height: 1.5;
      text-align: justify;
      white-space: pre-wrap;
      padding: 10px 12px;
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #4f46e5;
      border-radius: 4px;
      margin-bottom: 10px;
      min-height: 80px;
    }

    /* Grid de Visitantes */
    .visitors-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }
    .visitor-card {
      display: flex;
      border: 1px solid #cbd5e1;
      background-color: #ffffff;
      padding: 6px;
      gap: 10px;
      align-items: center;
      position: relative;
      break-inside: avoid;
    }
    .visitor-photo {
      width: 50px;
      height: 65px;
      border: 1px solid #475569;
      background-color: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .visitor-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .visitor-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .visitor-name {
      font-size: 8.5pt;
      font-weight: bold;
      color: #0f172a;
      text-transform: uppercase;
      white-space: normal;
      word-wrap: break-word;
    }
    .visitor-meta {
      font-size: 7.5pt;
      color: #475569;
      margin-top: 2px;
    }
    .visitor-status {
      display: inline-block;
      font-size: 7.5pt;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 2px;
      text-transform: uppercase;
      margin-top: 4px;
      margin-bottom: 4px;
    }
    .status-active {
      background-color: #dcfce7;
      color: #166534;
      border: 1px solid #bbf7d0;
    }
    .status-inactive {
      background-color: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    /* Listagem de Advogados */
    .advocates-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
    }
    .advocate-item {
      display: flex;
      justify-content: space-between;
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 6px 10px;
      font-size: 8.5pt;
      font-weight: bold;
      border-radius: 4px;
    }
    .advocate-oab {
      font-family: monospace;
      color: #4f46e5;
    }

    /* Rodapé do Relatório */
    .footer-container {
      margin-top: 35px;
      border-top: 1px solid #94a3b8;
      padding-top: 6px;
      break-inside: avoid;
    }
    .footer-text {
      font-size: 7pt;
      color: #475569;
      text-align: justify;
      line-height: 1.25;
      margin: 0 0 10px 0;
    }
    .footer-metadata {
      display: flex;
      justify-content: space-between;
      font-family: Arial, sans-serif;
      font-size: 7pt;
      color: #64748b;
      border-top: 1px dashed #cbd5e1;
      padding-top: 5px;
      white-space: nowrap;
    }

    /* Forçar quebras de página controladas */
    .page-break-before {
      page-break-before: always;
    }
    .avoid-break {
      break-inside: avoid;
    }
    ${watermarkCss}
  </style>
</head>
<body>
  ${watermarkHtml}
  
  <!-- CABEÇALHO -->
  <div class="header-container">
    <div>
      ${aipLogo ? `<img src="${aipLogo}" class="header-logo-aip" alt="AIP" />` : '<div style="width:80px"></div>'}
    </div>
    <div class="header-text">
      <h1>Secretaria de Estado da Justiça de Rondônia</h1>
      <h2>Agência de Inteligência Penal - AIP/SEJUS/RO</h2>
      <h3>Qualificação de Apenado</h3>
    </div>
    <div>
      ${ppLogo ? `<img src="${ppLogo}" class="header-logo-pp" alt="Polícia Penal" />` : '<div style="width:100px"></div>'}
    </div>
  </div>

  <!-- BARRA DE CLASSIFICAÇÃO E BARCODE -->
  <div class="meta-bar">
    <div class="classification-stamp">
      ${classificationLabel}
    </div>
    <div class="barcode-container">
      ${barcodeSvg}
    </div>
  </div>

  <!-- IDENTIFICAÇÃO PRINCIPAL (FOTO E INFORMAÇÕES CHAVE) -->
  <div class="profile-section">
    <!-- Retícula da Foto -->
    <div class="photo-wrapper">
      <div class="tactical-corner corner-tl"></div>
      <div class="tactical-corner corner-tr"></div>
      <div class="tactical-corner corner-bl"></div>
      <div class="tactical-corner corner-br"></div>
      
      ${
        photoUri
          ? `<img src="${photoUri}" class="photo-img" alt="Alvo" />`
          : `<div class="photo-fallback">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Sem Registro<br/>Fotográfico</span>
             </div>`
      }
    </div>

    <!-- Tabela Lateral de Identificação -->
    <table class="info-table profile-details-table">
      <tr>
        <td colspan="2">
          <div class="info-label">Nome Completo</div>
          <div class="info-value" style="font-size: 11pt; color: #000;">${apenado.nome.toUpperCase()}</div>
        </td>
      </tr>
      ${
        apenado.nomeOutro
          ? `<tr>
              <td colspan="2">
                <div class="info-label">Alcunha / Nome Social / Outro Nome</div>
                <div class="info-value">${apenado.nomeOutro.toUpperCase()}</div>
              </td>
             </tr>`
          : ''
      }
      <tr>
        <td>
          <div class="info-label">Vulgo / Apelido no Crime</div>
          <div class="info-value" style="color: #b91c1c;">${apenado.vulgo ? apenado.vulgo.toUpperCase() : 'NÃO REGISTRADO'}</div>
        </td>
        <td>
          <div class="info-label">Facção Real (Verificada)</div>
          <div class="info-value faccao-highlight">${faccaoNome.toUpperCase()}</div>
        </td>
      </tr>
      <tr>
        <td>
          <div class="info-label">Grau de Relevância</div>
          <div class="info-value">${(apenado.facaoRealNome?.trim() || apenado.faccao?.trim()) ? (apenado.facaoRelevancia || 'MEMBRO') : 'SEM REGISTRO'}</div>
        </td>
        <td>
          <div class="info-label">Nível de Confiança</div>
          <div class="info-value" style="text-transform: uppercase;">${(apenado.facaoRealNome?.trim() || apenado.faccao?.trim()) ? (apenado.facaoNivel || 'SUSPEITA') : 'SEM REGISTRO'}</div>
        </td>
      </tr>
    </table>
  </div>

  <!-- SEÇÕES DINÂMICAS -->
  ${sectionsHtml}

  <!-- RODAPÉ LEGAL E SEGURANÇA -->
  <div class="footer-container">
    <p class="footer-text">${LEGAL_TEXT}</p>
    <div class="footer-metadata">
      <span>GERADO EM: ${new Date().toLocaleString('pt-BR')} · OPERADOR: ${operatorText}</span>
      <span>CLASSIFICAÇÃO: RESERVADO / AIP / SEJUS</span>
    </div>
  </div>

  <script>
    window.onload = function() {
      // Ajuste de margens ou zoom fino antes de disparar a impressão
      window.print();
      setTimeout(function() {
        window.close();
      }, 500);
    }
  </script>
</body>
</html>`

  // 3. Abrir janela e gravar
  const win = window.open('', '_blank', 'width=950,height=800')
  if (!win) {
    alert('Por favor, permita pop-ups para gerar e visualizar a Ficha de Qualificação.')
    return
  }

  win.document.write(html)
  win.document.close()
}
