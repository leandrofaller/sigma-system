#!/bin/sh
set -e

UPLOAD_DIR="${UPLOAD_DIR:-/app/uploads}"

# Garante que os subdirectorios existam e pertencem ao nextjs (uid 1001).
mkdir -p "$UPLOAD_DIR/relints" "$UPLOAD_DIR/chat" "$UPLOAD_DIR/received" "$UPLOAD_DIR/apenados"
chown -R 1001:1001 "$UPLOAD_DIR"

# Garante que o cache do Next.js existe e tem permissao de escrita.
mkdir -p /app/.next/cache
chown -R 1001:1001 /app/.next

echo "Executando migracoes do banco de dados..."
gosu nextjs node_modules/.bin/prisma db push --skip-generate || \
gosu nextjs npx prisma db push --skip-generate || true
echo "Migracoes concluidas!"

echo "Garantindo colunas de auditoria (idempotente)..."
gosu nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
Promise.all([
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"ocrText\" TEXT'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"ocrName\" TEXT'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoHashSha\" VARCHAR(64)'),
  p.\$executeRawUnsafe('CREATE INDEX IF NOT EXISTS \"apenados_photoHashSha_idx\" ON apenados(\"photoHashSha\")'),
]).then(() => { console.log('Colunas OK'); }).catch(e => { console.error('AVISO colunas:', e.message); }).finally(() => p.\$disconnect());
" || echo "AVISO: script de colunas falhou (nao critico)"

echo "Iniciando servidor..."
exec gosu nextjs node server.js
