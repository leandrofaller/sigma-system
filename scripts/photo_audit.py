#!/usr/bin/env python3
"""
photo_audit.py — Auditoria de fotos: qualidade de rosto (InsightFace) + OCR (pytesseract)

Protocolo stdin/stdout idêntico ao arcface_index.py:
  stdin:  JSON  { "ids": ["id1", ...], "uploads_dir": "/abs/path/to/apenados" }
  stdout: JSONL uma linha por ID + linha final {"done": true}
"""
import sys
import json
import os
import re
import io
import cv2

EXTENSIONS = (".webp", ".jpg", ".jpeg", ".png", ".bmp")

# Tokens que NÃO fazem parte de um nome próprio:
# conjunções/preposições, palavras de instituição, labels de campo, status de preso.
NON_NAME_TOKENS = {
    # Preposições / conjunções (exceto as que podem compor nomes: DE DA DO DOS DAS E)
    'EM', 'COM', 'NA', 'NO', 'A', 'O', 'AS', 'OS', 'POR', 'PARA',
    'ATE', 'SEM', 'SOB', 'SOBRE', 'THE', 'OF', 'IN', 'AND', 'OR',
    # Nomes de instituições / secretarias
    'SECRETARIA', 'SEGURANCA', 'PUBLICA', 'ESTADO', 'GOVERNO',
    'PENITENCIARIA', 'PENITENCIÁRIA', 'PRESIDIO', 'PRESÍDIO',
    'CADEIA', 'POLICIA', 'POLÍCIA', 'CIVIL', 'MILITAR', 'FEDERAL',
    'ESTADUAL', 'MUNICIPAL', 'DELEGACIA', 'DISTRITO', 'NACIONAL',
    'REPUBLICA', 'REPÚBLICA', 'BRASIL', 'BRASILEIRA', 'BRASILEIROS',
    # Siglas de secretarias estaduais
    'SEAP', 'SEJUS', 'SUSIPE', 'SAP', 'SESP', 'SEJUSP', 'SEJU',
    'SEDS', 'SECC', 'DEAP', 'DEPEN', 'FUNAP', 'SUSEPE',
    # Labels de campo da plaquinha
    'NOME', 'MATRICULA', 'MATRÍCULA', 'UNIDADE', 'DATA', 'SEXO',
    'FILIACAO', 'FILIAÇÃO', 'CRIME', 'ARTIGO', 'ENTRADA', 'SAIDA',
    'SAÍDA', 'REGIME', 'NASCIMENTO', 'REGISTRO', 'NUMERO', 'NÚMERO',
    'PROCESSO', 'IDENTIFICACAO', 'IDENTIFICAÇÃO', 'FOTO', 'PHOTO',
    'NATURALIDADE', 'NACIONALIDADE', 'PROFISSAO', 'PROFISSÃO',
    'ENDERECO', 'ENDEREÇO', 'VULGO', 'ALCUNHA', 'RG', 'CPF',
    # Status / categoria do preso
    'PRESO', 'DETENTO', 'INTERNO', 'REEDUCANDO', 'SENTENCIADO',
    'PROVISORIO', 'PROVISÓRIO', 'DEFINITIVO', 'CONDENADO',
    'CUSTODIADO', 'APENADO', 'PACIENTE', 'CAPTURADO',
}

# Regex para label explícito seguido do nome na mesma linha
# Ex: "NOME: JOAO DA SILVA" ou "PRESO  JOAO DA SILVA"
_NAME_LABEL_RE = re.compile(
    r'(?:NOME|PRESO|INTERNO|REEDUCANDO|SENTENCIADO|DETENTO|CUSTODIADO|PACIENTE|APENADO)'
    r'[\s:.\-/]+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇÑ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇÑ\s]{4,60})',
)


def _clean_tokens(raw: str) -> list[str]:
    """Extrai tokens de letras maiúsculas, filtrando NON_NAME_TOKENS."""
    return [
        t for t in re.findall(r'[A-ZÁÀÂÃÉÊÍÓÔÕÚÇÑ]{2,}', raw.upper())
        if t not in NON_NAME_TOKENS and len(t) <= 20
    ]


def extract_name(text: str) -> str:
    """
    Extrai nome próprio de texto OCR de plaquinha prisional.

    Estratégia em 3 camadas:
    1. Label explícito: busca "NOME: FULANO", "PRESO: FULANO", etc.
       → captura só o valor após o label na mesma linha.
    2. Análise linha a linha: ignora linhas com dígitos (datas/matrículas)
       e busca linhas com 2–5 palavras capitalizadas sem tokens de instituição.
    3. Fallback: abordagem original com filtro NON_NAME_TOKENS estendido.
    """
    upper = text.upper()

    # ── Camada 1: label explícito ────────────────────────────────────────
    m = _NAME_LABEL_RE.search(upper)
    if m:
        candidate = m.group(1).strip()
        tokens = _clean_tokens(candidate)
        if len(tokens) >= 2:
            return ' '.join(tokens[:5])

    # Caso especial: label e nome em linhas separadas
    # Ex:  "NOME:"  (linha)  "JOAO DA SILVA"  (próxima linha)
    lines = [ln.strip() for ln in upper.splitlines()]
    for i, ln in enumerate(lines):
        if re.search(r'\b(?:NOME|PRESO|INTERNO|REEDUCANDO|APENADO)\b', ln) and i + 1 < len(lines):
            next_ln = lines[i + 1]
            if next_ln and not re.search(r'\d', next_ln):
                tokens = _clean_tokens(next_ln)
                if len(tokens) >= 2:
                    return ' '.join(tokens[:5])

    # ── Camada 2: análise linha a linha ──────────────────────────────────
    name_candidates: list[str] = []
    for ln in lines:
        if not ln or len(ln) < 4:
            continue
        # Descarta linhas com dígitos (datas, matrículas, números de processo)
        if re.search(r'\d', ln):
            continue
        # Descarta linhas que são só um label (ex: "NOME:", "DATA:")
        if re.match(r'^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇÑ]{2,20}\s*:?\s*$', ln):
            continue
        tokens = _clean_tokens(ln)
        # Nome: 2–5 palavras, cada uma com 2–20 letras
        if 2 <= len(tokens) <= 5 and all(2 <= len(t) <= 20 for t in tokens):
            name_candidates.append(' '.join(tokens))

    if name_candidates:
        # Prefere o candidato com mais palavras (nome mais completo)
        return max(name_candidates, key=lambda s: len(s.split()))

    # ── Camada 3: fallback (abordagem original com filtro estendido) ──────
    tokens = [
        t for t in re.findall(r'[A-ZÁÀÂÃÉÊÍÓÔÕÚÇÑ]{3,}', upper)
        if t not in NON_NAME_TOKENS
    ]
    if len(tokens) >= 2:
        return ' '.join(tokens[:5])

    return ''


def imread_safe(path: str):
    """cv2.imread com correção de orientação EXIF.
    Fotos tiradas em celular ficam rotacionadas sem isso."""
    try:
        from PIL import Image, ImageOps
        import numpy as np
        pil = ImageOps.exif_transpose(Image.open(path).convert("RGB"))
        return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    except Exception:
        return cv2.imread(path)


def preprocess_for_ocr(img_bgr):
    """Melhora contraste para OCR: CLAHE em grayscale.
    Preserva detalhes de texto em fotos com iluminação irregular."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    return enhanced


def find_photo(uploads_dir: str, apenado_id: str) -> str | None:
    for ext in EXTENSIONS:
        path = os.path.join(uploads_dir, f"{apenado_id}{ext}")
        if os.path.exists(path):
            return path
    return None


def main() -> None:
    data = json.loads(sys.stdin.read())
    ids: list[str] = data['ids']
    uploads_dir: str = data['uploads_dir']

    # ── Carrega InsightFace (suprime logs de inicialização) ─────────────
    _old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        from insightface.app import FaceAnalysis
        face_app = FaceAnalysis(
            name='buffalo_l',
            root=os.environ.get('INSIGHTFACE_HOME', '/tmp'),
        )
        face_app.prepare(ctx_id=-1, det_size=(640, 640))
    finally:
        sys.stdout = _old_stdout

    # ── Importa pytesseract ─────────────────────────────────────────────
    try:
        import pytesseract
        from PIL import Image as PILImage
        ocr_available = True
    except ImportError:
        ocr_available = False

    # ── Processa cada ID ────────────────────────────────────────────────
    for aid in ids:
        try:
            photo_path = find_photo(uploads_dir, aid)
            if not photo_path:
                print(json.dumps({'id': aid, 'no_photo': True}), flush=True)
                continue

            img = imread_safe(photo_path)
            if img is None:
                print(json.dumps({'id': aid, 'error': 'cannot read image'}), flush=True)
                continue

            # Face detection
            faces = face_app.get(img)
            faces_count = len(faces)
            det_score = 0.0
            if faces:
                best = max(faces, key=lambda f: float(f.det_score))
                det_score = round(float(best.det_score), 4)

            # OCR
            ocr_text = ''
            ocr_name = ''
            if ocr_available:
                h, w = img.shape[:2]
                max_dim = 1200
                if max(h, w) > max_dim:
                    scale = max_dim / max(h, w)
                    img_ocr = cv2.resize(img, (int(w * scale), int(h * scale)),
                                         interpolation=cv2.INTER_AREA)
                else:
                    img_ocr = img.copy()

                # Pré-processamento: CLAHE para melhorar contraste do texto
                enhanced = preprocess_for_ocr(img_ocr)
                pil_img = PILImage.fromarray(enhanced)

                # PSM 6: bloco uniforme de texto (melhor para plaquinhas estruturadas)
                raw = pytesseract.image_to_string(
                    pil_img, lang='por+eng',
                    config='--psm 6 --oem 3',
                )
                ocr_text = raw.strip()[:1000]
                ocr_name = extract_name(ocr_text)

                # Fallback PSM 11 (texto esparso) se PSM 6 não extraiu nome
                if not ocr_name:
                    raw2 = pytesseract.image_to_string(
                        pil_img, lang='por+eng',
                        config='--psm 11 --oem 3',
                    )
                    ocr_text2 = raw2.strip()[:1000]
                    ocr_name = extract_name(ocr_text2)
                    if ocr_text2 and not ocr_text:
                        ocr_text = ocr_text2

            print(json.dumps({
                'id': aid,
                'faces': faces_count,
                'det_score': det_score,
                'ocr_text': ocr_text,
                'ocr_name': ocr_name,
            }), flush=True)

        except Exception as e:
            print(json.dumps({'id': aid, 'error': str(e)}), flush=True)

    print(json.dumps({'done': True}), flush=True)


if __name__ == '__main__':
    main()
