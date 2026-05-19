#!/usr/bin/env python3
"""
Detecta todos os rostos em uma imagem e extrai embeddings ArcFace (512-dim).
Usa o modelo buffalo_l do InsightFace (baixado automaticamente na 1a execucao ~326 MB).

Uso: python arcface_analyze.py <caminho_da_imagem>
Saida: JSON em stdout
"""
import sys
import json
import os

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Uso: python arcface_analyze.py <imagem>"}))
        sys.exit(1)

    image_path = sys.argv[1]

    if not os.path.isfile(image_path):
        print(json.dumps({"error": f"Arquivo nao encontrado: {image_path}"}))
        sys.exit(1)

    try:
        import cv2
        import numpy as np
        from insightface.app import FaceAnalysis
    except Exception as e:
        print(json.dumps({
            "error": f"Erro ao importar: {type(e).__name__}: {e}",
            "install": "pip install insightface onnxruntime opencv-python-headless"
        }), flush=True)
        sys.exit(1)

    try:
        app = FaceAnalysis(
            name="buffalo_l",
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        app.prepare(ctx_id=0, det_size=(640, 640))

        img = cv2.imread(image_path)
        if img is None:
            print(json.dumps({"error": f"Nao foi possivel ler a imagem: {image_path}"}))
            sys.exit(1)

        h, w = img.shape[:2]
        faces = app.get(img)

        # Ordena por pontuacao de deteccao decrescente
        faces = sorted(faces, key=lambda f: float(f.det_score), reverse=True)

        result_faces = []
        for i, face in enumerate(faces):
            emb = face.normed_embedding  # ja normalizado L2 (512 dims)
            bbox = face.bbox.tolist()    # [x1, y1, x2, y2] em pixels

            kps = []
            if hasattr(face, "kps") and face.kps is not None:
                kps = face.kps.tolist()

            result_faces.append({
                "index":     i,
                "det_score": round(float(face.det_score), 4),
                "bbox":      [round(v, 1) for v in bbox],
                "kps":       [[round(x, 1), round(y, 1)] for x, y in kps],
                "embedding": emb.tolist(),
            })

        print(json.dumps({
            "faces":       result_faces,
            "imageWidth":  w,
            "imageHeight": h,
        }))

    except Exception as e:
        import traceback
        print(json.dumps({"error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-500:]}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
