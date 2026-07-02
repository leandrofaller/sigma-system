#!/bin/sh
set -e

UPLOAD_DIR="${UPLOAD_DIR:-/app/uploads}"

# Garante que os subdirectorios existam e pertencem ao nextjs (uid 1001).
mkdir -p "$UPLOAD_DIR/relints" "$UPLOAD_DIR/chat" "$UPLOAD_DIR/received" "$UPLOAD_DIR/apenados" "$UPLOAD_DIR/arquivo"
chown -R 1001:1001 "$UPLOAD_DIR"

# Garante que o cache do Next.js existe e tem permissao de escrita.
mkdir -p /app/.next/cache
chown -R 1001:1001 /app/.next

echo "Executando migracoes do banco de dados..."
gosu nextjs node_modules/.bin/prisma db push --skip-generate || \
gosu nextjs npx prisma db push --skip-generate || true
echo "Migracoes concluidas!"

echo "Executando setup idempotente do banco de dados..."
gosu nextjs node scripts/db-setup.js || echo "AVISO: setup do banco falhou (nao critico)"

echo "Iniciando API Python FastAPI em background..."
PYTHONPATH=/app/backend/app gosu nextjs /opt/arcface-venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 &

echo "Iniciando servidor..."
exec gosu nextjs env NODE_OPTIONS="--max-old-space-size=2048" node server.js
