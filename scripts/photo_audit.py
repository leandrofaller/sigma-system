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

# Stopwords que não compõem nomes próprios
STOP_WORDS = {
    'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'EM', 'COM', 'NA', 'NO',
    'A', 'O', 'AS', 'OS', 'POR', 'PARA', 'ATE', 'SEM', 'SOB',
    'SOBRE', 'THE', 'OF', 'IN', 'AND', 'OR',
}


def find_photo(uploads_dir: str, apenado_id: str) -> str | None:
    for ext in EXTENSIONS:
        path = os.path.join(uploads_dir, f"{apenado_id}{ext}")
        if os.path.exists(path):
            return path
    return None


def extract_name(text: str) -> str:
    tokens = [
        t for t in re.findall(r'[A-ZÁÀÂÃÉÊÍÓÔÕÚÇÑ]{3,}', text.upper())
        if t not in STOP_WORDS
    ]
    if len(tokens) >= 2:
        return ' '.join(tokens[:5])
    return ''


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

            img = cv2.imread(photo_path)
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
                    img_ocr = img

                # Convert BGR→RGB para PIL
                pil_img = PILImage.fromarray(cv2.cvtColor(img_ocr, cv2.COLOR_BGR2RGB))
                raw = pytesseract.image_to_string(
                    pil_img, lang='por+eng',
                    config='--psm 11 --oem 3',
                )
                ocr_text = raw.strip()[:1000]
                ocr_name = extract_name(ocr_text)

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
