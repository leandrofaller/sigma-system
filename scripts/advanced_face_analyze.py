#!/usr/bin/env python3
"""
Pipeline Avançado de Análise Facial (IA Facial)
Implementa: Detecção facial SCRFD, Alinhamento, Quality Score, Anti-Spoofing (Liveness) e Extração de Embeddings.
Também permite busca de similaridade cossena ultrarrápida usando FAISS (ou NumPy como fallback) caso candidatos sejam fornecidos.

Uso 1 (CLI): python advanced_face_analyze.py <imagem>
Uso 2 (stdin): {"image_path": "<imagem>", "candidates": [{"id": "...", "embedding": [...]}, ...], "min_similarity": 0.4, "top_n": 20}
"""
import sys
import json
import os
import math
import warnings
warnings.filterwarnings('ignore')

# Tenta importar FAISS. Se não disponível, usará fallback em NumPy
try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False

EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

def imread_safe(path: str):
    """cv2.imread com correção de orientação EXIF para fotos tiradas em celulares."""
    try:
        import cv2
        from PIL import Image, ImageOps
        import numpy as np
        pil = ImageOps.exif_transpose(Image.open(path).convert("RGB"))
        return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    except Exception:
        import cv2
        return cv2.imread(path)

def analyze_pose(kps):
    """Calcula pose facial (roll, yaw, pitch) estimada a partir de 5 Landmarks faciais.
    KPS: [olho_esquerdo, olho_direito, nariz, boca_esquerda, boca_direita]
    Retorna dicionário com scores normalizados (0.0 a 1.0) e ângulos estimados.
    """
    import numpy as np
    
    # 1. Roll (Inclinação no plano 2D)
    dx = kps[1][0] - kps[0][0]
    dy = kps[1][1] - kps[0][1]
    roll_angle = float(np.arctan2(dy, dx) * 180 / np.pi)
    # Tolerância de 15 graus. Acima de 30 graus o score zera.
    roll_score = max(0.0, 1.0 - min(1.0, abs(roll_angle) / 30.0))

    # 2. Yaw (Rotação horizontal)
    # Mede a assimetria do nariz em relação aos dois olhos
    dist_eye_left = float(np.linalg.norm(kps[2] - kps[0]))
    dist_eye_right = float(np.linalg.norm(kps[2] - kps[1]))
    yaw_ratio = abs(dist_eye_left - dist_eye_right) / max(1.0, dist_eye_left + dist_eye_right)
    # Razão 0.0 é frontal perfeita. Acima de 0.3 indica rotação acentuada.
    yaw_score = max(0.0, 1.0 - min(1.0, yaw_ratio * 3.3))

    # 3. Pitch (Rotação vertical - olhar para cima/baixo)
    # Mede a proporção da distância vertical olhos-nariz e nariz-boca
    eye_y = (kps[0][1] + kps[1][1]) / 2.0
    mouth_y = (kps[3][1] + kps[4][1]) / 2.0
    dist_eye_nose = abs(kps[2][1] - eye_y)
    dist_nose_mouth = abs(mouth_y - kps[2][1])
    pitch_ratio = abs(dist_eye_nose - dist_nose_mouth) / max(1.0, dist_eye_nose + dist_nose_mouth)
    # Razão 0.0 é frontal vertical. Acima de 0.3 indica olhar muito alto ou baixo.
    pitch_score = max(0.0, 1.0 - min(1.0, pitch_ratio * 3.3))

    pose_score = round(roll_score * 0.4 + yaw_score * 0.3 + pitch_score * 0.3, 4)
    
    return {
        "pose_score": pose_score,
        "roll": round(roll_angle, 1),
        "yaw_ratio": round(yaw_ratio, 2),
        "pitch_ratio": round(pitch_ratio, 2)
    }

def analyze_quality(img, bbox, kps):
    """Mede a qualidade facial em detalhes.
    Calcula: Iluminação, Blur/Nitidez, Contraste, Pose e Oclusão.
    Retorna o quality_score consolidado (0 a 100) e os detalhes.
    """
    import cv2
    import numpy as np

    x1, y1, x2, y2 = [int(v) for v in bbox]
    h_img, w_img = img.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w_img, x2), min(h_img, y2)
    
    crop = img[y1:y2, x1:x2]
    if crop.size == 0 or crop.shape[0] < 20 or crop.shape[1] < 20:
        return {"score": 0, "blur": 0, "brightness": 0, "contrast": 0, "pose": 0, "is_valid": False}

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)

    # 1. Nitidez/Blur (Variância do Laplaciano)
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    # Acima de 120 é considerado nítido
    blur_score = min(1.0, lap_var / 120.0)

    # 2. Iluminação (Brilho Médio)
    mean_val = float(gray.mean())
    # Brilho ideal é 127. Muito escuro (<45) ou estourado (>220) são penalizados
    if mean_val < 45:
        brightness_score = max(0.0, mean_val / 45.0)
    elif mean_val > 220:
        brightness_score = max(0.0, (255.0 - mean_val) / (255.0 - 220.0))
    else:
        brightness_score = 1.0

    # 3. Contraste (Desvio Padrão)
    std_val = float(gray.std())
    # Contraste aceitável acima de 20
    contrast_score = min(1.0, std_val / 40.0)

    # 4. Pose (Inclinação e Frontalidade)
    pose_info = analyze_pose(kps)
    pose_score = pose_info["pose_score"]

    # Peso final de Qualidade Geral
    # Nitidez (30%), Iluminação (25%), Contraste (20%), Pose (25%)
    weighted_score = (blur_score * 0.3 + brightness_score * 0.25 + contrast_score * 0.20 + pose_score * 0.25)
    quality_percent = round(weighted_score * 100, 1)

    # Critérios mínimos para aceitação automática
    is_valid = (
        quality_percent >= 45.0 and 
        lap_var >= 40.0 and 
        mean_val >= 35.0 and 
        mean_val <= 235.0 and 
        pose_info["pose_score"] >= 0.4
    )

    return {
        "score": quality_percent,
        "blur_score": round(blur_score * 100, 1),
        "brightness_score": round(brightness_score * 100, 1),
        "contrast_score": round(contrast_score * 100, 1),
        "pose_score": round(pose_score * 100, 1),
        "details": {
            "laplacian_variance": round(lap_var, 1),
            "mean_luminance": round(mean_val, 1),
            "std_luminance": round(std_val, 1),
            "roll_angle": pose_info["roll"],
            "yaw_ratio": pose_info["yaw_ratio"],
            "pitch_ratio": pose_info["pitch_ratio"]
        },
        "is_valid": is_valid
    }

def analyze_liveness(img, face):
    """Anti-Spoofing avançado baseado em textura (FFT, Sobel e Laplaciano).
    Mede moiré (telas) e perda de texturas finas 3D (fotos impressas).
    Retorna um score consolidade de vivacidade (liveness_score) de 0.0 a 1.0.
    """
    try:
        import cv2
        import numpy as np

        x1, y1, x2, y2 = [int(v) for v in face.bbox]
        h_img, w_img = img.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w_img, x2), min(h_img, y2)
        
        crop = img[y1:y2, x1:x2]
        if crop.size == 0 or crop.shape[0] < 20 or crop.shape[1] < 20:
            return 0.0

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        
        # 1. Variância Laplaciana (Medida de desfoque de textura fina)
        lap = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        s_lap = min(1.0, lap / 500.0)

        # 2. Densidade de bordas por Sobel (Telas e impressões tendem a acumular ou diluir bordas)
        sx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        grad_std = float(np.sqrt(sx ** 2 + sy ** 2).std())
        s_grad = min(1.0, grad_std / 35.0)

        # 3. Análise de Frequência FFT (Detecta padrões de Moiré em monitores/telas)
        f = np.abs(np.fft.fftshift(np.fft.fft2(gray)))
        h, w = f.shape
        r = min(h, w) // 4
        cy, cx = h // 2, w // 2
        
        # Razão de energia de altas frequências
        hf_energy = float(f.sum() - f[cy - r:cy + r, cx - r:cx + r].sum())
        total_energy = float(f.sum() + 1e-8)
        hf_ratio = hf_energy / total_energy
        s_hf = min(1.0, hf_ratio * 4.5)

        # Pontuação consolidada
        liveness = round(s_lap * 0.35 + s_grad * 0.3 + s_hf * 0.35, 4)
        
        # Se as métricas forem suspeitas ou excessivamente artificiais, reduz
        # Telas de monitores às vezes criam picos de gradiente artificiais
        if grad_std > 150.0 and hf_ratio > 0.4:
            liveness = round(liveness * 0.4, 4)

        return liveness
    except Exception:
        return 0.0

def perform_vector_search(query_emb, candidates, min_sim, top_n):
    """Realiza busca vetorial cossena usando FAISS (se disponível) ou NumPy como fallback."""
    import numpy as np
    
    if not candidates:
        return []

    q_vec = np.array(query_emb, dtype=np.float32)
    # L2 normaliza para garantir que a similaridade cossena seja equivalente ao produto interno
    q_vec = q_vec / np.linalg.norm(q_vec)

    cand_ids = [c["id"] for c in candidates]
    cand_embs = [c["embedding"] for c in candidates]
    cand_matrix = np.array(cand_embs, dtype=np.float32)
    
    # L2 normaliza matriz de candidatos
    norms = np.linalg.norm(cand_matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1e-8
    cand_matrix = cand_matrix / norms

    similarities = []

    if FAISS_AVAILABLE:
        # FAISS IndexFlatIP (Produto Interno de vetores normalizados = Similaridade Cossena)
        dim = q_vec.shape[0]
        index = faiss.IndexFlatIP(dim)
        index.add(cand_matrix)
        
        # Executa busca
        scores, indices = index.search(np.expand_dims(q_vec, axis=0), len(candidates))
        scores = scores[0]
        indices = indices[0]

        for sim, idx in zip(scores, indices):
            if idx < 0:
                continue
            sim_val = float(sim)
            if sim_val >= min_sim:
                similarities.append({
                    "id": cand_ids[idx],
                    "similarity": round(sim_val, 4)
                })
    else:
        # Fallback NumPy (Produto Escalar simples)
        dots = np.dot(cand_matrix, q_vec)
        for idx, sim in enumerate(dots):
            sim_val = float(sim)
            if sim_val >= min_sim:
                similarities.append({
                    "id": cand_ids[idx],
                    "similarity": round(sim_val, 4)
                })
        
        # Ordena descendente
        similarities = sorted(similarities, key=lambda x: x["similarity"], reverse=True)

    return similarities[:top_n]

def main():
    # Modo stdin (JSON estruturado) ou CLI simples
    is_json_input = False
    stdin_data = {}

    if not sys.stdin.isatty():
        try:
            raw = sys.stdin.read().strip()
            if raw:
                stdin_data = json.loads(raw)
                is_json_input = True
        except Exception:
            pass

    if is_json_input:
        image_path = stdin_data.get("image_path", "")
        candidates = stdin_data.get("candidates", [])
        min_similarity = float(stdin_data.get("min_similarity", 0.4))
        top_n = int(stdin_data.get("top_n", 20))
    else:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Uso: python advanced_face_analyze.py <imagem>"}))
            sys.exit(1)
        image_path = sys.argv[1]
        candidates = []
        min_similarity = 0.4
        top_n = 20

    if not os.path.isfile(image_path):
        print(json.dumps({"error": f"Arquivo nao encontrado: {image_path}"}))
        sys.exit(1)

    try:
        import cv2
        import numpy as np
        from insightface.app import FaceAnalysis
    except BaseException as e:
        print(json.dumps({
            "error": f"Erro ao importar bibliotecas: {type(e).__name__}: {e}",
            "install": "pip install insightface onnxruntime opencv-python-headless numpy faiss-cpu"
        }), flush=True)
        sys.exit(1)

    try:
        # Carrega o InsightFace silenciosamente redirecionando o stdout temporariamente
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

        img = imread_safe(image_path)
        if img is None:
            print(json.dumps({"error": f"Nao foi possivel ler a imagem: {image_path}"}))
            sys.exit(1)

        h, w = img.shape[:2]
        faces = app.get(img)

        # Ordena faces pelo tamanho da bounding box
        faces = sorted(faces, key=lambda f: float((f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1])), reverse=True)

        result_faces = []
        for i, face in enumerate(faces):
            emb = face.normed_embedding  # já normalizado L2
            bbox = face.bbox.tolist()    # [x1, y1, x2, y2]
            kps = face.kps.tolist() if hasattr(face, "kps") and face.kps is not None else []

            # Quality Score
            quality_info = analyze_quality(img, bbox, kps)

            # Liveness/Anti-Spoofing
            liveness = analyze_liveness(img, face)

            face_entry = {
                "index": i,
                "det_score": round(float(face.det_score), 4),
                "bbox": [round(v, 1) for v in bbox],
                "kps": [[round(x, 1), round(y, 1)] for x, y in kps],
                "embedding": emb.tolist(),
                "liveness_score": liveness,
                "quality": quality_info
            }

            # Executa busca vetorial se candidatos foram fornecidos
            if candidates:
                face_entry["matches"] = perform_vector_search(emb.tolist(), candidates, min_similarity, top_n)

            result_faces.append(face_entry)

        print(json.dumps({
            "faces": result_faces,
            "imageWidth": w,
            "imageHeight": h,
            "faiss_enabled": FAISS_AVAILABLE
        }))

    except Exception as e:
        import traceback
        print(json.dumps({"error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-500:]}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
