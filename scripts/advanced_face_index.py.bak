#!/usr/bin/env python3
"""
Indexa em lote rostos de apenados usando o Pipeline de IA Facial.
Recebe JSON com lista de IDs via stdin. Carrega o modelo uma vez.
Para cada ID busca a foto em <uploads_dir>/<id>.jpg (ou .jpeg/.png/.webp).

Entrada (stdin): {"ids": ["id1", "id2", ...], "uploads_dir": "/abs/path"}
Saida (stdout): JSON linha por linha para cada ID processado
                {"id": "...", "embedding": [...512 floats...], "det_score": 0.99, "liveness_score": 0.85, "quality_score": 78.5}
                {"id": "...", "no_face": true}
                {"id": "...", "error": "mensagem"}
Final:          {"done": true}
"""
import sys
import json
import os
import warnings
warnings.filterwarnings('ignore')

# Reutiliza as funções de pose, qualidade e liveness do analyze
from advanced_face_analyze import imread_safe, analyze_quality, analyze_liveness

MIN_DET_SCORE = 0.35
EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

def find_photo(uploads_dir: str, id_: str) -> str | None:
    for ext in EXTENSIONS:
        path = os.path.join(uploads_dir, id_ + ext)
        if os.path.isfile(path):
            return path
    return None

def best_face(faces):
    """Seleciona o rosto principal: combina det_score (60%) + área normalizada (40%)."""
    def score(f):
        x1, y1, x2, y2 = f.bbox
        area = max(0.0, (x2 - x1) * (y2 - y1))
        return float(f.det_score) * 0.6 + min(area / 100_000.0, 1.0) * 0.4
    return max(faces, key=score)

def main():
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({"error": "stdin vazio"}))
        sys.exit(1)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON invalido: {e}"}))
        sys.exit(1)

    ids = data.get("ids", [])
    uploads_dir = data.get("uploads_dir", "")

    if not ids:
        print(json.dumps({"done": True, "processed": 0}))
        return

    if not uploads_dir or not os.path.isdir(uploads_dir):
        print(json.dumps({"error": f"uploads_dir invalido: {uploads_dir!r}"}))
        sys.exit(1)

    try:
        import cv2
        import numpy as np
        from insightface.app import FaceAnalysis
    except BaseException as e:
        print(json.dumps({
            "error": f"Erro ao importar bibliotecas: {type(e).__name__}: {e}",
            "install": "pip install insightface onnxruntime opencv-python-headless numpy"
        }), flush=True)
        raise SystemExit(1)

    import io as _io
    _real_stdout = sys.stdout
    sys.stdout = _io.StringIO()
    try:
        import onnxruntime as ort
        providers_env = os.getenv("ARCFACE_PROVIDERS")
        if providers_env:
            providers = [p.strip() for p in providers_env.split(",") if p.strip()]
        else:
            if ort.get_device() == "GPU" and "CUDAExecutionProvider" in ort.get_available_providers():
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            else:
                providers = ["CPUExecutionProvider"]

        app = FaceAnalysis(
            name="buffalo_l",
            providers=providers,
        )
        app.prepare(ctx_id=0, det_size=(640, 640))
    finally:
        sys.stdout = _real_stdout

    for id_ in ids:
        photo_path = find_photo(uploads_dir, id_)
        if photo_path is None:
            print(json.dumps({"id": id_, "no_photo": True}), flush=True)
            continue

        try:
            img = imread_safe(photo_path)
            if img is None:
                print(json.dumps({"id": id_, "error": "nao foi possivel ler imagem"}), flush=True)
                continue

            faces = app.get(img)
            if not faces:
                print(json.dumps({"id": id_, "no_face": True}), flush=True)
                continue

            # Seleciona o melhor rosto detectado
            best = best_face(faces)

            # Descarte se score de detecção for muito baixo
            if float(best.det_score) < MIN_DET_SCORE:
                print(json.dumps({
                    "id": id_,
                    "no_face": True,
                    "low_det_score": round(float(best.det_score), 4),
                }), flush=True)
                continue

            emb = best.normed_embedding.tolist()
            bbox = best.bbox.tolist()
            kps = best.kps.tolist() if hasattr(best, "kps") and best.kps is not None else []

            # Analisa Qualidade e Liveness
            quality_info = analyze_quality(img, bbox, kps)
            liveness_score = analyze_liveness(img, best)

            print(json.dumps({
                "id": id_,
                "embedding": emb,
                "det_score": round(float(best.det_score), 4),
                "liveness_score": liveness_score,
                "quality_score": quality_info["score"],
                "quality_details": quality_info
            }), flush=True)

        except Exception as e:
            print(json.dumps({"id": id_, "error": str(e)}), flush=True)

    print(json.dumps({"done": True}), flush=True)

if __name__ == "__main__":
    main()
