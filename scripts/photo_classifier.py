#!/usr/bin/env python3
"""
Classifica fotos de apenados: rosto, documento, tatuagem, corpo, sem rosto.
NÃO grava embeddings — apenas apoia o painel de qualidade e filtros de remoção manual.

Entrada (stdin): {"ids": [...], "uploads_dir": "...", "photo_paths": {"id": "/abs/path"}}
Saída (stdout): uma linha JSON por ID + {"done": true}
"""
from __future__ import annotations

import json
import os
import re
import sys
import warnings

warnings.filterwarnings("ignore")

# Limita o uso de CPU restringindo as threads do ONNX Runtime
try:
    import onnxruntime as ort
    _original_InferenceSession = ort.InferenceSession
    class PatchedInferenceSession(_original_InferenceSession):
        def __init__(self, model_path, sess_options=None, *args, **kwargs):
            if sess_options is None:
                sess_options = ort.SessionOptions()
            sess_options.intra_op_num_threads = 1
            sess_options.inter_op_num_threads = 1
            super().__init__(model_path, sess_options, *args, **kwargs)
    ort.InferenceSession = PatchedInferenceSession
except ImportError:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from face_detect_utils import (
    MIN_DET_SCORE_CLASSIFY,
    create_face_app,
    detect_faces_robust,
    find_photo,
    imread_safe,
    pick_best_detection,
)

DOC_KEYWORDS = re.compile(
    r"registro\s*geral|identidade|carteira|certificado|eleitor|nascimento|"
    r"filiacao|filiação|expedi[cç][aã]o|ministerio|ministério|secretaria|"
    r"rep[uú]blica|org[aã]o\s*emissor|penitenci[aá]ria|sipe|sejus|"
    r"cpf|rg\b|cnh|passaporte|documento|matr[ií]cula",
    re.I,
)
CPF_RE = re.compile(r"\d{3}\.?\d{3}\.?\d{3}-?\d{2}")
RG_RE = re.compile(r"\b\d{1,2}\.?\d{3}\.?\d{3}-?[0-9xX]\b")
TATTOO_PATH_RE = re.compile(r"tatuagem|tattoo|tatoo|tatuag|cicatriz|scar", re.I)
DOC_PATH_RE = re.compile(r"doc|rg|cpf|documento|certid|identidade", re.I)


def run_ocr(img) -> tuple[str, float]:
    """OCR opcional (tesseract). Retorna (texto, score_documento 0-1)."""
    try:
        import pytesseract
        from PIL import Image
        import cv2
        import numpy as np

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        text = pytesseract.image_to_string(pil, lang="por+eng", config="--psm 6").strip()
        if not text or len(text) < 4:
            # Segunda tentativa em região central (cartões)
            h, w = img.shape[:2]
            crop = img[int(h * 0.05) : int(h * 0.95), int(w * 0.05) : int(w * 0.95)]
            pil2 = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
            text = pytesseract.image_to_string(pil2, lang="por+eng", config="--psm 4").strip()

        if not text:
            return "", 0.0

        lower = text.lower()
        score = 0.0
        if DOC_KEYWORDS.search(lower):
            score += 0.55
        if CPF_RE.search(text):
            score += 0.35
        if RG_RE.search(text):
            score += 0.25
        # Muitas linhas curtas = layout de documento
        lines = [ln.strip() for ln in text.splitlines() if len(ln.strip()) > 2]
        if len(lines) >= 4:
            score += 0.2
        alpha_ratio = sum(c.isalpha() for c in text) / max(len(text), 1)
        if alpha_ratio > 0.45 and len(text) > 30:
            score += 0.15

        return text[:4000], min(1.0, score)
    except Exception:
        return "", 0.0


def document_visual_score(img) -> tuple[float, str]:
    import cv2
    import numpy as np

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    if h < 20 or w < 20:
        return 0.0, ""

    light_ratio = float(np.mean(gray > 185))
    dark_ratio = float(np.mean(gray < 70))
    contrast = float(gray.std()) / 128.0

    edges = cv2.Canny(gray, 40, 120)
    edge_density = float(np.mean(edges > 0))

    h_lines = 0
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=max(40, w // 8), minLineLength=int(w * 0.2), maxLineGap=12)
    if lines is not None:
        for ln in lines:
            x1, y1, x2, y2 = ln[0]
            if abs(y2 - y1) <= 4 and abs(x2 - x1) > w * 0.18:
                h_lines += 1

    aspect = w / max(h, 1)
    card_aspect = 1.4 <= aspect <= 1.8 or 0.55 <= aspect <= 0.75

    score = 0.0
    reasons = []
    if light_ratio > 0.35:
        score += 0.25
        reasons.append("fundo_claro")
    if dark_ratio > 0.08 and light_ratio > 0.2:
        score += 0.15
        reasons.append("contraste_texto")
    if h_lines >= 3:
        score += 0.25
        reasons.append(f"linhas_horiz({h_lines})")
    if card_aspect:
        score += 0.15
        reasons.append("proporcao_doc")
    if edge_density > 0.06 and contrast > 0.35:
        score += 0.15
        reasons.append("alta_borda")

    return min(1.0, score), ",".join(reasons)


def skin_mask(img):
    import cv2
    import numpy as np

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    m1 = cv2.inRange(hsv, (0, 20, 50), (25, 180, 255))
    m2 = cv2.inRange(hsv, (0, 30, 60), (35, 200, 255))
    m3 = cv2.inRange(hsv, (5, 15, 40), (30, 160, 240))
    mask = cv2.bitwise_or(cv2.bitwise_or(m1, m2), m3)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)


def tattoo_visual_score(img, face_area_ratio: float) -> tuple[float, str]:
    import cv2
    import numpy as np

    if face_area_ratio > 0.08:
        return 0.0, ""

    h, w = img.shape[:2]
    mask = skin_mask(img)
    skin_ratio = float(np.sum(mask > 0)) / max(h * w, 1)
    if skin_ratio < 0.12:
        return 0.0, ""

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    skin_gray = cv2.bitwise_and(gray, gray, mask=mask)
    lap_var = float(cv2.Laplacian(skin_gray, cv2.CV_64F).var())
    texture = min(1.0, lap_var / 90.0)

    # Tinta = pixels escuros sobre pele
    dark_on_skin = cv2.bitwise_and((gray < 85).astype("uint8") * 255, mask)
    ink_ratio = float(np.sum(dark_on_skin > 0)) / max(np.sum(mask > 0), 1)

    # Saturação localizada (tatuagens coloridas)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]
    sat_skin = sat[mask > 0]
    sat_score = float(np.mean(sat_skin > 40)) if sat_skin.size else 0.0

    score = skin_ratio * 0.25 + texture * 0.35 + min(ink_ratio * 4, 1.0) * 0.3 + sat_score * 0.1
    reasons = []
    if skin_ratio > 0.2:
        reasons.append(f"pele({skin_ratio:.0%})")
    if texture > 0.35:
        reasons.append(f"textura({texture:.2f})")
    if ink_ratio > 0.04:
        reasons.append(f"tinta({ink_ratio:.0%})")

    return min(1.0, score), ",".join(reasons)


def face_area_ratio(img, face) -> float:
    if face is None:
        return 0.0
    x1, y1, x2, y2 = face.bbox
    h, w = img.shape[:2]
    area = max(0.0, (x2 - x1) * (y2 - y1))
    return area / max(h * w, 1)


def classify_record(
    img,
    path: str,
    complement_hint: str | None,
    faces,
    detect_method: str,
) -> dict:
    path_lower = (path or "").lower()
    hint_lower = (complement_hint or "").lower()

    best_face, det_score = pick_best_detection(faces, MIN_DET_SCORE_CLASSIFY)
    has_face = best_face is not None
    area_ratio = face_area_ratio(img, best_face)

    ocr_text, ocr_doc_score = run_ocr(img)
    vis_doc_score, vis_doc_reason = document_visual_score(img)
    doc_path = bool(DOC_PATH_RE.search(path_lower))
    tattoo_path = bool(TATTOO_PATH_RE.search(path_lower))
    tattoo_hint = bool(re.search(r"tatuagem|tattoo|tatoo|tatuag|cicatriz|scar", hint_lower))

    tattoo_score, tattoo_reason = tattoo_visual_score(img, area_ratio)
    if tattoo_path or tattoo_hint:
        tattoo_score = max(tattoo_score, 0.75)

    doc_score = max(ocr_doc_score, vis_doc_score)
    if doc_path:
        doc_score = max(doc_score, 0.7)

    # --- Decisão final ---
    if has_face and area_ratio >= 0.02:
        return {
            "category": "FACE_OK",
            "confidence": round(min(1.0, det_score + area_ratio), 3),
            "reason": f"rosto detectado ({detect_method}, score={det_score:.2f}, area={area_ratio:.1%})",
            "has_face": True,
            "det_score": round(det_score, 4),
            "ocr_text": ocr_text[:2000] if ocr_text else None,
        }

    if doc_score >= 0.55:
        parts = []
        if ocr_doc_score >= 0.4:
            parts.append("ocr")
        if vis_doc_score >= 0.4:
            parts.append(vis_doc_reason or "visual")
        if doc_path:
            parts.append("caminho")
        return {
            "category": "DOCUMENT",
            "confidence": round(doc_score, 3),
            "reason": "documento: " + ", ".join(p for p in parts if p),
            "has_face": False,
            "det_score": round(det_score, 4) if det_score else None,
            "ocr_text": ocr_text[:2000] if ocr_text else None,
        }

    if tattoo_score >= 0.45 and doc_score < 0.45:
        return {
            "category": "TATTOO",
            "confidence": round(tattoo_score, 3),
            "reason": f"tatuagem/corpo: {tattoo_reason or 'heurística visual'}",
            "has_face": False,
            "det_score": None,
            "ocr_text": ocr_text[:500] if ocr_text else None,
        }

    # Rosto marginal — provável falso negativo do indexador
    if det_score and det_score >= 0.15 and area_ratio >= 0.01:
        return {
            "category": "FACE_MISSED",
            "confidence": round(det_score, 3),
            "reason": f"rosto marginal não indexado ({detect_method}, score={det_score:.2f})",
            "has_face": True,
            "det_score": round(det_score, 4),
            "ocr_text": None,
        }

    if tattoo_score >= 0.3 and skin_mask(img).sum() > 0:
        return {
            "category": "BODY",
            "confidence": round(tattoo_score, 3),
            "reason": f"parte do corpo sem rosto ({tattoo_reason})",
            "has_face": False,
            "det_score": None,
            "ocr_text": None,
        }

    return {
        "category": "NO_FACE",
        "confidence": 0.5,
        "reason": "sem rosto identificável",
        "has_face": False,
        "det_score": round(det_score, 4) if det_score else None,
        "ocr_text": ocr_text[:500] if ocr_text else None,
    }


def main():
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({"error": "stdin vazio"}))
        sys.exit(1)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON inválido: {e}"}))
        sys.exit(1)

    ids = data.get("ids", [])
    uploads_dir = data.get("uploads_dir", "")
    photo_paths: dict = data.get("photo_paths", {})
    complement_hints: dict = data.get("complement_hints", {})

    if not ids:
        print(json.dumps({"done": True}))
        return

    try:
        app = create_face_app()
    except BaseException as e:
        print(json.dumps({
            "error": f"Falha ao iniciar InsightFace: {type(e).__name__}: {e}",
            "install": "pip install insightface onnxruntime opencv-python-headless",
        }))
        sys.exit(1)

    for id_ in ids:
        photo_path = photo_paths.get(id_) or find_photo(uploads_dir, id_)
        if not photo_path or not os.path.isfile(photo_path):
            print(json.dumps({"id": id_, "error": "arquivo não encontrado"}), flush=True)
            continue

        try:
            img = imread_safe(photo_path)
            if img is None:
                print(json.dumps({"id": id_, "error": "imagem ilegível"}), flush=True)
                continue

            faces, method = detect_faces_robust(app, img)
            result = classify_record(
                img,
                photo_path,
                complement_hints.get(id_),
                faces,
                method,
            )
            result["id"] = id_
            print(json.dumps(result, ensure_ascii=False), flush=True)
        except Exception as e:
            print(json.dumps({"id": id_, "error": str(e)}), flush=True)

    print(json.dumps({"done": True}), flush=True)


if __name__ == "__main__":
    main()