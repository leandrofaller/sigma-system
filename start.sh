#!/bin/sh
echo "Criando diretórios de upload..."
mkdir -p "${UPLOAD_DIR:-/app/uploads}/relints"
mkdir -p "${UPLOAD_DIR:-/app/uploads}/chat"

echo "Executando migrações do banco de dados..."
node_modules/.bin/prisma db push --skip-generate || npx prisma db push --skip-generate
echo "Migrações concluídas!"
echo "Iniciando servidor..."
exec node server.js
