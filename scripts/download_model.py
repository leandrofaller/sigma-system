#!/usr/bin/env python3
"""
Pré-baixa o modelo buffalo_l do InsightFace durante o Docker build.
Executado como usuario nextjs para que os arquivos tenham o dono correto.
"""
import os
os.environ['INSIGHTFACE_HOME'] = '/opt/arcface-models'

from insightface.app import FaceAnalysis
app = FaceAnalysis(name='buffalo_l')
app.prepare(ctx_id=-1, det_size=(640, 640))
print('Modelo buffalo_l OK')
