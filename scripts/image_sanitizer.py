#!/usr/bin/env python3
"""
Script complementar de higienização e controle de qualidade de imagens de apenados.
Realiza a detecção de rosto (InsightFace), calcula nitidez (Laplacian variance),
brilho médio (LAB L-channel) e gera hashes perceptuais (ImageHash/dHash).

Entrada (stdin): {"ids": ["id1", "id2", ...], "uploads_dir": "/abs/path", "photo_paths": {"id1": "/abs/path/photo1.jpg"}}
Saída (stdout): JSON linha por linha para cada ID processado:
                {"id": "...", "has_face": true, "det_score": 0.98, "face_width": 120, "face_height": 120, "blur_score": 45.2, "brightness": 128.5, "phash": "...", "dhash": "..."}
"""
import sys
import json
import os
import warnings
warnings.filterwarnings('ignore')

EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
MIN_DET_SCORE = 0.35

def find_photo(uploads_dir: str, id_: str) -> str | None:
    for ext in EXTENSIONS:
        path = os.path.join(uploads_dir, id_ + ext)
        if os.path.isfile(path):
            return path
    return None

def imread_safe(path: str):
    """cv2.imread com correção de orientação EXIF."""
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
    """Seleciona o rosto principal (combina det_score + área)."""
    def score(f):
        x1, y1, x2, y2 = f.bbox
        area = max(0.0, (x2 - x1) * (y2 - y1))
        return float(f.det_score) * 0.6 + min(area / 100_000.0, 1.0) * 0.4
    return max(faces, key=score)

def calculate_dhash(path: str) -> str | None:
    """Gera dHash compatível com a lógica implementada no Node.js/Sharp (9x8 -> 64bit hex)."""
    try:
        from PIL import Image
        img_pil = Image.open(path).convert('L')
        # Redimensiona para 9x8 usando interpolação NEAREST para compatibilidade com Sharp
        img_resized = img_pil.resize((9, 8), Image.Resampling.NEAREST)
        pixels = list(img_resized.getdata())
        width, height = img_resized.size
        
        hash_val = 0
        for row in range(8):
            for col in range(8):
                left = pixels[row * width + col]
                right = pixels[row * width + col + 1]
                hash_val = (hash_val << 1) | (1 if left > right else 0)
        return f"{hash_val:016x}"
    except Exception:
        return None

def calculate_phash(path: str) -> str | None:
    """Calcula pHash usando imagehash (se disponível) ou retorna None."""
    try:
        import imagehash
        from PIL import Image
        hash_val = imagehash.phash(Image.open(path))
        return str(hash_val)
    except Exception:
        return None

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
    photo_paths = data.get("photo_paths", {})

    if not ids:
        print(json.dumps({"done": True, "processed": 0}))
        return

    if not photo_paths and (not uploads_dir or not os.path.isdir(uploads_dir)):
        print(json.dumps({"error": "uploads_dir inválido e photo_paths não fornecido"}))
        sys.exit(1)

    # 1. Tentar importar dependências de visão computacional
    try:
        import cv2
        from insightface.app import FaceAnalysis
    except BaseException as e:
        print(json.dumps({
            "error": f"Erro de importação no {sys.executable}: {type(e).__name__}: {e}",
            "install": "pip install insightface onnxruntime opencv-python-headless Pillow",
        }), flush=True)
        sys.exit(1)

    # 2. Inicializar InsightFace
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

        insightface_home = os.getenv('INSIGHTFACE_HOME', os.path.expanduser('~/.insightface'))
        app = FaceAnalysis(name="buffalo_l", root=insightface_home, providers=providers)
        app.prepare(ctx_id=0, det_size=(640, 640))
    finally:
        sys.stdout = _real_stdout

    for id_ in ids:
        photo_path = photo_paths.get(id_) or find_photo(uploads_dir, id_)
        if photo_path is None:
            print(json.dumps({"id": id_, "error": "arquivo de foto não encontrado"}), flush=True)
            continue

        try:
            img = imread_safe(photo_path)
            if img is None:
                print(json.dumps({"id": id_, "error": "não foi possível ler a imagem (formato corrompido)"}), flush=True)
                continue

            # Calcula hashes da imagem
            dhash = calculate_dhash(photo_path)
            phash = calculate_phash(photo_path)

            faces = app.get(img)
            
            # Fallback 1: Contraste
            if not faces:
                try:
                    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                    cl_img = cv2.cvtColor(clahe.apply(gray), cv2.COLOR_GRAY2BGR)
                    faces = app.get(cl_img)
                except Exception:
                    pass

            # Fallback 2: Tamanho da detecção
            if not faces:
                try:
                    app.prepare(ctx_id=0, det_size=(1024, 1024))
                    faces = app.get(img)
                    app.prepare(ctx_id=0, det_size=(640, 640))
                except Exception:
                    try:
                        app.prepare(ctx_id=0, det_size=(640, 640))
                    except Exception:
                        pass

            if not faces:
                print(json.dumps({
                    "id": id_,
                    "has_face": False,
                    "phash": phash,
                    "dhash": dhash
                }), flush=True)
                continue

            # Rosto principal
            best = best_face(faces)

            # Verifica o det_score mínimo
            if float(best.det_score) < MIN_DET_SCORE:
                print(json.dumps({
                    "id": id_,
                    "has_face": False,
                    "low_det_score": round(float(best.det_score), 4),
                    "phash": phash,
                    "dhash": dhash
                }), flush=True)
                continue

            # Extração de Métricas de Qualidade
            x1, y1, x2, y2 = [int(v) for v in best.bbox]
            y1, y2 = max(0, y1), min(img.shape[0], y2)
            x1, x2 = max(0, x1), min(img.shape[1], x2)
            face_width = x2 - x1
            face_height = y2 - y1

            # Recorte da face para avaliar Blur e Brilho
            face_crop = img[y1:y2, x1:x2]
            blur_score = 0.0
            brightness = 127.0

            if face_crop.size > 0:
                # 1. Nitidez (Variância do Laplaciano)
                try:
                    gray_face = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
                    blur_score = round(float(cv2.Laplacian(gray_face, cv2.CV_64F).var()), 2)
                except Exception:
                    pass

                # 2. Brilho médio no espaço de cor LAB (canal L - Luminosidade)
                try:
                    lab = cv2.cvtColor(face_crop, cv2.COLOR_BGR2LAB)
                    l_channel, _, _ = cv2.split(lab)
                    brightness = round(float(l_channel.mean()), 2)
                except Exception:
                    pass

            print(json.dumps({
                "id": id_,
                "has_face": True,
                "det_score": round(float(best.det_score), 4),
                "face_width": face_width,
                "face_height": face_height,
                "blur_score": blur_score,
                "brightness": brightness,
                "phash": phash,
                "dhash": dhash
            }), flush=True)

        except Exception as e:
            print(json.dumps({"id": id_, "error": str(e)}), flush=True)

    print(json.dumps({"done": True}), flush=True)

if __name__ == "__main__":
    main()
