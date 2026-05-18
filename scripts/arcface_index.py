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

EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


def find_photo(uploads_dir: str, id_: str) -> str | None:
    for ext in EXTENSIONS:
        path = os.path.join(uploads_dir, id_ + ext)
        if os.path.isfile(path):
            return path
    return None


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
    except ImportError as e:
        pkg = str(e).split("'")[1] if "'" in str(e) else str(e)
        print(json.dumps({
            "error": f"Dependencia ausente: {pkg}",
            "install": "pip install insightface onnxruntime opencv-python",
        }))
        sys.exit(1)

    app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    app.prepare(ctx_id=0, det_size=(640, 640))

    for id_ in ids:
        photo_path = find_photo(uploads_dir, id_)
        if photo_path is None:
            print(json.dumps({"id": id_, "no_photo": True}), flush=True)
            continue

        try:
            img = cv2.imread(photo_path)
            if img is None:
                print(json.dumps({"id": id_, "error": "nao foi possivel ler imagem"}), flush=True)
                continue

            faces = app.get(img)
            if not faces:
                print(json.dumps({"id": id_, "no_face": True}), flush=True)
                continue

            # Melhor rosto = maior det_score
            best = max(faces, key=lambda f: float(f.det_score))
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
