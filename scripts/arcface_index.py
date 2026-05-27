#!/usr/bin/env python3
"""
Indexa em lote rostos de apenados usando InsightFace ArcFace (buffalo_l).
Recebe JSON com lista de IDs via stdin. Carrega o modelo uma vez.
Para cada ID busca a foto em <uploads_dir>/<id>.jpg (ou .jpeg/.png/.webp).

Entrada (stdin): {"ids": ["id1", "id2", ...], "uploads_dir": "/abs/path"}
Saida (stdout): JSON linha por linha para cada ID processado
                {"id": "...", "embedding": [...512 floats...], "det_score": 0.99}
                {"id": "...", "no_face": true}
                {"id": "...", "error": "mensagem"}
Final:          {"done": true}
"""
import sys
import json
import os
import glob
import warnings
warnings.filterwarnings('ignore')

EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

# Confiança mínima de detecção. Abaixo disso o embedding é pouco confiável
# e polui o índice com vetores ruins → falsos positivos na busca.
# RetinaFace: > 0.5 = confiável, 0.35-0.5 = marginal, < 0.35 = descarte.
MIN_DET_SCORE = 0.35


def find_photo(uploads_dir: str, id_: str) -> str | None:
    for ext in EXTENSIONS:
        path = os.path.join(uploads_dir, id_ + ext)
        if os.path.isfile(path):
            return path
    return None


def imread_safe(path: str):
    """cv2.imread com correção de orientação EXIF.
    Fotos tiradas em celular ficam rotacionadas sem isso — reduz det_score ou causa no_face."""
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
    """Seleciona o rosto principal: combina det_score (60%) + área normalizada (40%).
    Evita selecionar rosto pequeno de fundo quando há múltiplos detectados."""
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
        from insightface.app import FaceAnalysis
    except BaseException as e:
        print(json.dumps({
            "error": f"Erro ao importar: {type(e).__name__}: {e}",
            "install": "pip install insightface onnxruntime opencv-python-headless",
        }), flush=True)
        raise SystemExit(1)

    import io as _io
    _real_stdout = sys.stdout
    sys.stdout = _io.StringIO()
    try:
        app = FaceAnalysis(
            name="buffalo_l",
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
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

            # Melhor rosto = maior det_score (60%) + maior área (40%)
            best = best_face(faces)

            # Descarta embeddings com confiança abaixo do mínimo — vetores ruins
            # causam falsos positivos na busca e degradam a qualidade do índice.
            if float(best.det_score) < MIN_DET_SCORE:
                print(json.dumps({
                    "id": id_,
                    "no_face": True,
                    "low_det_score": round(float(best.det_score), 4),
                }), flush=True)
                continue

            emb = best.normed_embedding.tolist()

            print(json.dumps({
                "id": id_,
                "embedding": emb,
                "det_score": round(float(best.det_score), 4),
            }), flush=True)

        except Exception as e:
            print(json.dumps({"id": id_, "error": str(e)}), flush=True)

    print(json.dumps({"done": True}), flush=True)


if __name__ == "__main__":
    main()
