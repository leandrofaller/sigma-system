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

# Stage 3: Runner — Debian slim (glibc necessário para wheels Python do InsightFace)
FROM node:20-slim AS runner

# Sistema: openssl, gosu (su-exec equivalente), cliente postgres, zip, Python + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    gosu \
    postgresql-client \
    zip \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Instala InsightFace 0.7.3 em venv isolado
# Sem --prefer-binary: pip instala 0.7.3 do source (g++ já disponível via build-essential)
RUN python3 -m venv /opt/arcface-venv && \
    /opt/arcface-venv/bin/pip install --no-cache-dir \
        onnxruntime \
        opencv-python-headless \
        "insightface==0.7.3"

# Pré-baixa o modelo buffalo_l (~326 MB) em camada separada para cache eficiente
ENV INSIGHTFACE_HOME=/opt/insightface
RUN mkdir -p /opt/insightface && \
    /opt/arcface-venv/bin/python3 -c \
        "from insightface.app import FaceAnalysis; app = FaceAnalysis(name='buffalo_l'); app.prepare(ctx_id=0, det_size=(640,640))" && \
    chmod -R 755 /opt/insightface

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV ARCFACE_PYTHON=/opt/arcface-venv/bin/python3

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid 1001 nextjs

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

# Declara o volume — Coolify deve montar aqui para persistência
VOLUME ["/app/uploads"]

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "start.sh"]
