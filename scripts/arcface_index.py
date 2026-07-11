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
import json
import os
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
    MIN_DET_SCORE_INDEX,
    best_face,
    create_face_app,
    detect_faces_robust,
    find_photo,
    imread_safe,
)


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
    photo_paths = data.get("photo_paths", {})
    model_name = data.get("model", "buffalo_l")

    if not ids:
        print(json.dumps({"done": True, "processed": 0}))
        return

    if not photo_paths and (not uploads_dir or not os.path.isdir(uploads_dir)):
        print(json.dumps({"error": f"uploads_dir invalido: {uploads_dir!r} e photo_paths nao fornecido"}))
        sys.exit(1)

    try:
        app = create_face_app(name=model_name)
    except BaseException as e:
        print(json.dumps({
            "error": f"Erro ao importar no {sys.executable}: {type(e).__name__}: {e}",
            "install": "pip install insightface onnxruntime opencv-python-headless",
        }), flush=True)
        raise SystemExit(1)

    for id_ in ids:
        photo_path = photo_paths.get(id_) or find_photo(uploads_dir, id_)
        if photo_path is None:
            print(json.dumps({"id": id_, "no_photo": True}), flush=True)
            continue

        try:
            img = imread_safe(photo_path)
            if img is None:
                print(json.dumps({"id": id_, "error": "nao foi possivel ler imagem"}), flush=True)
                continue

            faces, _method = detect_faces_robust(app, img)

            if not faces:
                print(json.dumps({"id": id_, "no_face": True}), flush=True)
                continue

            best = best_face(faces)

            if float(best.det_score) < MIN_DET_SCORE_INDEX:
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