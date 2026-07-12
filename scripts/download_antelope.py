#!/usr/bin/env python3
"""
Pré-baixa o modelo antelopev2 do InsightFace.
Pode ser executado durante o Docker build ou manualmente para restaurar os modelos.
"""
import os
import urllib.request
import zipfile

dest_dir = '/opt/arcface-models/models/antelopev2'
os.makedirs(dest_dir, exist_ok=True)

url = 'https://huggingface.co/MonsterMMORPG/tools/resolve/main/antelopev2.zip'
zip_path = '/tmp/antelopev2.zip'

try:
    print("Baixando o modelo Antelopev2 a partir do mirror público...")
    urllib.request.urlretrieve(url, zip_path)
    
    print("Extraindo arquivos do modelo...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall('/opt/arcface-models/models')
        
    print("Modelo instalado em /opt/arcface-models/models/antelopev2/")
except Exception as e:
    print(f"Erro ao baixar/extrair modelo: {e}")
finally:
    if os.path.exists(zip_path):
        os.remove(zip_path)

print("Processo concluído.")
