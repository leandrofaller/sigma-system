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
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
# su-exec permite dropar privilégios após acertar permissões do volume montado
RUN apk add --no-cache openssl su-exec postgresql-client
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Copia o Prisma client e CLI completos para o runner
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Cria symlink correto para o CLI — copiar o arquivo diretamente quebra __dirname
# e o CLI passa a procurar o .wasm na pasta .bin/ em vez de prisma/build/
RUN mkdir -p ./node_modules/.bin && \
    ln -sf ../prisma/build/index.js ./node_modules/.bin/prisma

COPY --from=builder /app/start.sh ./start.sh
RUN chmod +x start.sh

# Caminho fixo para uploads
ENV UPLOAD_DIR=/app/uploads

# Declara o volume — Coolify deve montar aqui para persistência
VOLUME ["/app/uploads"]

# Roda como root para que o entrypoint possa corrigir permissões do volume montado
# start.sh usa su-exec para dropar para nextjs antes de iniciar o servidor
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "start.sh"]
