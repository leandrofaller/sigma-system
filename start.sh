#!/bin/sh
set -e

UPLOAD_DIR="${UPLOAD_DIR:-/app/uploads}"

echo "[1/5] Criando diretorios de upload..."
mkdir -p "$UPLOAD_DIR/relints" "$UPLOAD_DIR/chat" "$UPLOAD_DIR/received" "$UPLOAD_DIR/apenados" "$UPLOAD_DIR/arquivo"
chown -R 1001:1001 "$UPLOAD_DIR"

echo "[2/5] Preparando cache do Next.js..."
mkdir -p /app/.next/cache
chown -R 1001:1001 /app/.next

echo "[3/5] Executando prisma db push (timeout 600s)..."
timeout 600 gosu nextjs node_modules/.bin/prisma db push --skip-generate || \
timeout 600 gosu nextjs npx prisma db push --skip-generate || \
echo "AVISO: prisma db push falhou ou expirou (continuando...)"
echo "[3/5] prisma db push concluido."

echo "[4/5] Executando setup idempotente do banco de dados..."
gosu nextjs node scripts/db-setup.js || echo "AVISO: setup do banco falhou (nao critico)"
echo "[4/5] Setup do banco concluido."

echo "[5/5] Iniciando servicos..."
PYTHONPATH=/app/backend/app gosu nextjs /opt/arcface-venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 &

echo "Iniciando servidor Next.js..."
exec gosu nextjs env NODE_OPTIONS="--max-old-space-size=2048" node server.js
