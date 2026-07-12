# Stage 1: Dependencies (Alpine — builds são mais leves e rápidas)
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci --legacy-peer-deps

# Stage 2: Builder (Alpine)
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

# Stage 2b: Binários glibc do sharp para o runner Debian
# O deps instala sharp com binários musl (Alpine). O runner usa Debian (glibc),
# então precisamos dos binários corretos para evitar erro de runtime.
FROM node:20-slim AS sharp_glibc
WORKDIR /tmp/sharp_build
COPY --from=deps /app/node_modules/sharp/package.json ./sharp_pkg.json
RUN SHARP_VER=$(node -p "require('./sharp_pkg.json').version") && \
    npm install --ignore-scripts=false --omit=dev "sharp@${SHARP_VER}"

# Stage 2c: Compilação das dependências do Python
FROM node:20-slim AS python_builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-dev build-essential cmake \
    && rm -rf /var/lib/apt/lists/*
ARG PIP_CACHE_BUST=2026-05-20a
WORKDIR /tmp/build
COPY backend/requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    echo "cache-bust: ${PIP_CACHE_BUST}" && \
    python3 -m venv /opt/arcface-venv && \
    /opt/arcface-venv/bin/pip install --upgrade pip && \
    /opt/arcface-venv/bin/pip install -r ./requirements.txt && \
    /opt/arcface-venv/bin/pip install --prefer-binary \
        "numpy<2" \
        insightface==0.7.3 \
        "onnxruntime==1.16.3" \
        opencv-python-headless \
        pytesseract \
        Pillow

# Stage 3: Runner — Debian slim com Python/InsightFace (glibc, compativel com wheels Python)
FROM node:20-slim AS runner

# Ferramentas gerais + Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl gosu postgresql-client zip tzdata \
    python3 python3-venv \
    libglib2.0-0 tesseract-ocr tesseract-ocr-por \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs && \
    mkdir -p /home/nextjs && chown 1001:1001 /home/nextjs

# Copia o ambiente virtual Python já compilado do builder
COPY --from=python_builder /opt/arcface-venv /opt/arcface-venv

# Diretorio de modelos ja com dono nextjs (pode gravar no primeiro uso se download falhar aqui)
RUN mkdir -p /opt/arcface-models && chown 1001:1001 /opt/arcface-models


# Pre-baixa os modelos buffalo_l e antelopev2 (~700 MB) antes da cópia do código-fonte para aproveitar o cache do Docker
COPY scripts/download_model.py /tmp/download_model.py
RUN HOME=/tmp MPLCONFIGDIR=/tmp/.matplotlib MPLBACKEND=Agg ARCFACE_PROVIDERS=CPUExecutionProvider \
    /opt/arcface-venv/bin/python3 -u /tmp/download_model.py && \
    chown -R 1001:1001 /opt/arcface-models && \
    chmod -R 755 /opt/arcface-models
RUN rm -f /tmp/download_model.py

ENV ARCFACE_PYTHON=/opt/arcface-venv/bin/python3
ENV INSIGHTFACE_HOME=/opt/arcface-models

# Copia o Prisma client e CLI completos para o runner
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Sobrescreve binários musl do sharp com binários glibc (compatíveis com Debian)
COPY --from=sharp_glibc /tmp/sharp_build/node_modules/@img /app/node_modules/@img

# Cria symlink correto para o CLI
RUN mkdir -p ./node_modules/.bin && \
    ln -sf ../prisma/build/index.js ./node_modules/.bin/prisma

# Por último, realiza a cópia dos arquivos do código-fonte (que mudam frequentemente)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/start.sh ./start.sh

RUN chmod +x start.sh && chown -R 1001:1001 /app

# Caminho fixo para uploads
ENV UPLOAD_DIR=/app/uploads

# Declara o volume — Coolify deve montar aqui para persistencia
VOLUME ["/app/uploads"]

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "start.sh"]
