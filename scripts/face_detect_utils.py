"""
Utilitários compartilhados de detecção facial (InsightFace buffalo_l).
Usado por arcface_index.py (indexação) e photo_classifier.py (classificação).
"""
from __future__ import annotations

import os
import warnings

warnings.filterwarnings("ignore")

EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

# Indexação ArcFace: não abaixar — embeddings fracos poluem a busca.
MIN_DET_SCORE_INDEX = float(os.getenv("ARCFACE_MIN_DET_SCORE", "0.35"))

# Classificação apenas: limiar mais baixo para achar falsos negativos.
MIN_DET_SCORE_CLASSIFY = float(os.getenv("PHOTO_CLASSIFY_MIN_DET_SCORE", "0.22"))


def find_photo(uploads_dir: str, id_: str) -> str | None:
    for ext in EXTENSIONS:
        path = os.path.join(uploads_dir, id_ + ext)
        if os.path.isfile(path):
            return path
    return None


def imread_safe(path: str):
    """cv2.imread com correção EXIF."""
    try:
        import cv2
        from PIL import Image, ImageOps
        import numpy as np

        pil = ImageOps.exif_transpose(Image.open(path).convert("RGB"))
        return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    except Exception:
        import cv2

        return cv2.imread(path)


def best_face(faces):
    """Rosto principal: det_score (60%) + área normalizada (40%)."""

    def score(f):
        x1, y1, x2, y2 = f.bbox
        area = max(0.0, (x2 - x1) * (y2 - y1))
        return float(f.det_score) * 0.6 + min(area / 100_000.0, 1.0) * 0.4

    return max(faces, key=score)


def upscale_if_needed(img, min_side: int = 900):
    import cv2

    h, w = img.shape[:2]
    m = max(h, w)
    if m >= min_side:
        return img, 1.0
    scale = min_side / m
    return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC), scale


def apply_clahe(img):
    import cv2

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return cv2.cvtColor(clahe.apply(gray), cv2.COLOR_GRAY2BGR)


def apply_gamma(img, gamma: float = 1.4):
    import numpy as np

    inv = 1.0 / gamma
    table = (np.arange(256) / 255.0) ** inv * 255
    table = table.astype("uint8")
    import cv2

    return cv2.LUT(img, table)


def create_face_app(name: str = "buffalo_l"):
    """Inicializa FaceAnalysis com providers do ambiente."""
    import io as _io
    import sys

    import cv2  # noqa: F401
    from insightface.app import FaceAnalysis

    _real_stdout = sys.stdout
    sys.stdout = _io.StringIO()
    try:
        import onnxruntime as ort

        providers_env = os.getenv("ARCFACE_PROVIDERS")
        if providers_env:
            providers = [p.strip() for p in providers_env.split(",") if p.strip()]
        elif ort.get_device() == "GPU" and "CUDAExecutionProvider" in ort.get_available_providers():
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        else:
            providers = ["CPUExecutionProvider"]

        insightface_home = os.getenv('INSIGHTFACE_HOME', '/opt/arcface-models')
        app = FaceAnalysis(name=name, root=insightface_home, providers=providers)
        app.prepare(ctx_id=0, det_size=(640, 640))
        return app
    finally:
        sys.stdout = _real_stdout


def detect_faces_robust(app, img, det_sizes=(640, 1024, 1280)):
    """
    Múltiplas passagens de detecção. Retorna (faces, método).
    Não altera limiar de confiança — só melhora recall.
    """
    import cv2

    variants = [
        ("original", img),
        ("upscaled", upscale_if_needed(img)[0]),
        ("clahe", apply_clahe(img)),
        ("gamma", apply_gamma(img, 1.35)),
        ("clahe_up", apply_clahe(upscale_if_needed(img)[0])),
    ]

    for label, variant in variants:
        faces = app.get(variant)
        if faces:
            return faces, label

    original_det = (640, 640)
    try:
        for size in det_sizes:
            if size == 640:
                continue
            app.prepare(ctx_id=0, det_size=(size, size))
            for label, variant in [("original", img), ("upscaled", upscale_if_needed(img)[0])]:
                faces = app.get(variant)
                if faces:
                    app.prepare(ctx_id=0, det_size=original_det)
                    return faces, f"{label}_det{size}"
    finally:
        try:
            app.prepare(ctx_id=0, det_size=original_det)
        except Exception:
            pass

    return [], "none"


def pick_best_detection(faces, min_score: float):
    if not faces:
        return None, 0.0
    best = best_face(faces)
    score = float(best.det_score)
    if score < min_score:
        return None, score
    return best, score