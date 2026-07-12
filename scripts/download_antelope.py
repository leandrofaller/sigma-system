#!/usr/bin/env python3
"""
Pré-baixa o modelo antelopev2 do InsightFace.
Pode ser executado durante o Docker build ou manualmente para restaurar os modelos.
"""
import os
import urllib.request
import zipfile
import tempfile

insightface_home = os.getenv('INSIGHTFACE_HOME', os.path.expanduser('~/.insightface'))
models_dir = os.path.join(insightface_home, 'models')
dest_dir = os.path.join(models_dir, 'antelopev2')
os.makedirs(dest_dir, exist_ok=True)

url = 'https://huggingface.co/MonsterMMORPG/tools/resolve/main/antelopev2.zip'
zip_path = os.path.join(tempfile.gettempdir(), 'antelopev2.zip')

try:
    print(f"Baixando o modelo Antelopev2 a partir do mirror público em {url}...")
    urllib.request.urlretrieve(url, zip_path)
    
    print("Extraindo arquivos do modelo...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(models_dir)
        
    # Organiza a estrutura de subpastas aninhadas que o zip cria por padrão
    nested_dir = os.path.join(dest_dir, 'antelopev2')
    if os.path.isdir(nested_dir):
        print("Ajustando subpastas do Antelopev2...")
        for f in os.listdir(nested_dir):
            if f.endswith('.onnx'):
                os.rename(os.path.join(nested_dir, f), os.path.join(dest_dir, f))
        try:
            os.rmdir(nested_dir)
        except Exception:
            pass
        
    print(f"Modelo instalado em {dest_dir}")
except Exception as e:
    print(f"Erro ao baixar/extrair modelo: {e}")
finally:
    if os.path.exists(zip_path):
        try:
            os.remove(zip_path)
        except Exception:
            pass

print("Processo concluído.")
