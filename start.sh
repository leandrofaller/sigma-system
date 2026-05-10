#!/bin/sh
set -e

UPLOAD_DIR="${UPLOAD_DIR:-/app/uploads}"

# Garante que os subdirectorios existam e pertencem ao nextjs (uid 1001).
# Isto resolve o problema de volume montado com dono root.
mkdir -p "$UPLOAD_DIR/relints" "$UPLOAD_DIR/chat" "$UPLOAD_DIR/received"
chown -R 1001:1001 "$UPLOAD_DIR"

echo "Executando migrações do banco de dados..."
# Roda prisma como nextjs
su-exec nextjs node_modules/.bin/prisma db push --skip-generate || \
su-exec nextjs npx prisma db push --skip-generate || true
echo "Migrações concluídas!"

echo "Iniciando servidor..."
exec su-exec nextjs node server.js
