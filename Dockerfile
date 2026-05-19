# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci --legacy-peer-deps

# Stage 2: Builder
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Stage 3: Runner — Debian slim com Python/InsightFace (glibc, compativel com wheels Python)
FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    gosu \
    postgresql-client \
    zip \
    python3 \
    python3-venv \
    python3-dev \
    build-essential \
    cmake \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# ARG force-invalida cache do registry (muda o valor para rebustar)
ARG PIP_CACHE_BUST=2026-05-20a
# numpy<2: onnxruntime 1.16.3 foi compilado com numpy 1.x, incompativel com numpy 2.x
RUN echo "cache-bust: ${PIP_CACHE_BUST}" && \
    python3 -m venv /opt/arcface-venv && \
    /opt/arcface-venv/bin/pip install --upgrade pip && \
    /opt/arcface-venv/bin/pip install \
        "numpy<2" \
        insightface==0.7.3 \
        "onnxruntime==1.16.3" \
        opencv-python-headless && \
    HOME=/tmp /opt/arcface-venv/bin/python3 -c "import numpy,onnxruntime,insightface; print('numpy',numpy.__version__,'onnxruntime',onnxruntime.__version__,'insightface',insightface.__version__)"

# Diretorio de modelos ja com dono nextjs (pode gravar no primeiro uso se download falhar aqui)
RUN mkdir -p /opt/arcface-models && chown 1001:1001 /opt/arcface-models

# Pre-baixa modelo buffalo_l (~326 MB) no build para evitar download na primeira requisicao
COPY scripts/download_model.py /tmp/download_model.py
RUN HOME=/tmp MPLCONFIGDIR=/tmp/.matplotlib MPLBACKEND=Agg \
    gosu nextjs /opt/arcface-venv/bin/python3 -u /tmp/download_model.py || \
    echo "AVISO: modelo sera baixado na primeira requisicao"
RUN rm -f /tmp/download_model.py

ENV ARCFACE_PYTHON=/opt/arcface-venv/bin/python3
ENV INSIGHTFACE_HOME=/opt/arcface-models

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

# Copia o Prisma client e CLI completos para o runner
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Cria symlink correto para o CLI
RUN mkdir -p ./node_modules/.bin && \
    ln -sf ../prisma/build/index.js ./node_modules/.bin/prisma

COPY --from=builder /app/start.sh ./start.sh
RUN chmod +x start.sh

# Caminho fixo para uploads
ENV UPLOAD_DIR=/app/uploads

# Declara o volume — Coolify deve montar aqui para persistencia
VOLUME ["/app/uploads"]

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "start.sh"]
