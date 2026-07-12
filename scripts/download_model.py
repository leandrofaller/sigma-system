#!/usr/bin/env python3
"""
Pré-baixa os modelos buffalo_l e antelopev2 do InsightFace durante o Docker build.
Garante que a imagem do container já venha com todos os arquivos de redes neurais embutidos.
"""
import os
import urllib.request
import zipfile
import tempfile

insightface_home = os.getenv('INSIGHTFACE_HOME', os.path.expanduser('~/.insightface'))
os.environ['INSIGHTFACE_HOME'] = insightface_home

from insightface.app import FaceAnalysis

# 1. Pré-inicializar buffalo_l (baixa automaticamente da URL padrão do InsightFace)
try:
    print("=== Inicializando modelo Buffalo_L ===")
    app_buf = FaceAnalysis(name='buffalo_l', root=insightface_home, providers=['CPUExecutionProvider'])
    app_buf.prepare(ctx_id=-1, det_size=(640, 640))
    print("✓ Buffalo_L carregado e verificado!")
except Exception as e:
    print(f"⚠️ Erro ao preparar Buffalo_L: {e}")

# 2. Pré-baixar antelopev2 (baixa do mirror estável no HuggingFace e organiza subpasta)
zip_path = os.path.join(tempfile.gettempdir(), 'antelopev2.zip')
try:
    print("=== Baixando modelo Antelopev2 ===")
    url = 'https://huggingface.co/MonsterMMORPG/tools/resolve/main/antelopev2.zip'
    urllib.request.urlretrieve(url, zip_path)
    
    print("=== Extraindo Antelopev2 ===")
    models_dir = os.path.join(insightface_home, 'models')
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(models_dir)
        
    # Organiza a estrutura de subpastas aninhadas que o zip cria por padrão
    antelope_dir = os.path.join(models_dir, 'antelopev2')
    nested_dir = os.path.join(antelope_dir, 'antelopev2')
    if os.path.isdir(nested_dir):
        print("Ajustando subpastas do Antelopev2...")
        for f in os.listdir(nested_dir):
            if f.endswith('.onnx'):
                os.rename(os.path.join(nested_dir, f), os.path.join(antelope_dir, f))
        try:
            os.rmdir(nested_dir)
        except Exception:
            pass
        
    # Valida o carregamento do Antelopev2
    app_ant = FaceAnalysis(name='antelopev2', root=insightface_home, providers=['CPUExecutionProvider'])
    app_ant.prepare(ctx_id=-1)
    print("✓ Antelopev2 carregado e verificado!")
except Exception as e:
    print(f"⚠️ Erro ao preparar Antelopev2: {e}")
finally:
    if os.path.exists(zip_path):
        try:
            os.remove(zip_path)
        except Exception:
            pass

print("=== Downloads de modelos concluídos com sucesso! ===")
