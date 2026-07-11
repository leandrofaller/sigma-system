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
import warnings
warnings.filterwarnings('ignore')


def imread_safe(path: str):
    """cv2.imread com correção de orientação EXIF.
    Fotos tiradas em celular ficam rotacionadas sem isso — reduz det_score ou causa no_face."""
    try:
        import cv2
        from PIL import Image, ImageOps
        import numpy as _np
        pil = ImageOps.exif_transpose(Image.open(path).convert("RGB"))
        return cv2.cvtColor(_np.array(pil), cv2.COLOR_RGB2BGR)
    except Exception:
        import cv2
        return cv2.imread(path)


def compute_liveness(img, face):
    """Heuristica de anti-spoofing via analise de textura (sem modelo extra).
    Combina variancia Laplaciana, complexidade de gradiente e energia de alta frequencia.
    Retorna 0.0 (suspeito) a 1.0 (real), ou None se a crop for invalida."""
    try:
        import cv2
        import numpy as np
        x1, y1, x2, y2 = [int(v) for v in face.bbox]
        x1, y1 = max(0, x1), max(0, y1)
        crop = img[y1:y2, x1:x2]
        if crop.size == 0 or crop.shape[0] < 20 or crop.shape[1] < 20:
            return None
        gray     = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        lap      = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        sx       = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sy       = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        grad_std = float(np.sqrt(sx ** 2 + sy ** 2).std())
        f        = np.abs(np.fft.fftshift(np.fft.fft2(gray)))
        h, w     = f.shape
        r        = min(h, w) // 4
        cy, cx   = h // 2, w // 2
        hf_ratio = float(1.0 - f[cy - r:cy + r, cx - r:cx + r].sum() / (f.sum() + 1e-8))
        s_lap    = min(1.0, lap      / 500.0)
        s_grad   = min(1.0, grad_std /  30.0)
        s_hf     = min(1.0, hf_ratio *   3.0)
        return round(s_lap * 0.4 + s_grad * 0.3 + s_hf * 0.3, 4)
    except Exception:
        return None

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Detecta rostos e extrai embeddings ArcFace.")
    parser.add_argument("image_path", help="Caminho para o arquivo de imagem.")
    parser.add_argument("--model", default="buffalo_l", choices=["buffalo_l", "antelopev2"], help="Modelo do InsightFace.")
    args = parser.parse_args()

    image_path = args.image_path
    model_name = args.model

    if not os.path.isfile(image_path):
        print(json.dumps({"error": f"Arquivo nao encontrado: {image_path}"}))
        sys.exit(1)

    try:
        import cv2
        import numpy as np
        from insightface.app import FaceAnalysis
    except BaseException as e:
        print(json.dumps({
            "error": f"Erro ao importar: {type(e).__name__}: {e}",
            "install": "pip install insightface onnxruntime opencv-python-headless"
        }), flush=True)
        raise SystemExit(1)

    try:
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
                name=model_name,
                providers=providers,
            )
            app.prepare(ctx_id=0, det_size=(640, 640))
        finally:
            sys.stdout = _real_stdout

        img = imread_safe(image_path)
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

            face_entry = {
                "index":     i,
                "det_score": round(float(face.det_score), 4),
                "bbox":      [round(v, 1) for v in bbox],
                "kps":       [[round(x, 1), round(y, 1)] for x, y in kps],
                "embedding": emb.tolist(),
            }
            liveness = compute_liveness(img, face)
            if liveness is not None:
                face_entry["liveness_score"] = liveness
            result_faces.append(face_entry)

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
