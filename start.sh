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

echo "Habilitando extensao unaccent para buscas accent-insensitive..."
gosu nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
Promise.all([
  p.\$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS unaccent'),
  p.\$executeRawUnsafe(\`CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS \$\$SELECT public.unaccent('public.unaccent', \$1)\$\$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT\`),
]).then(() => { console.log('Extensao unaccent OK'); }).catch(e => { console.error('AVISO unaccent:', e.message); }).finally(() => p.\$disconnect());
" || echo "AVISO: extensao unaccent falhou (nao critico)"

echo "Garantindo colunas de auditoria (idempotente)..."
gosu nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
Promise.all([
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"ocrText\" TEXT'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"ocrName\" TEXT'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoHashSha\" VARCHAR(64)'),
  p.\$executeRawUnsafe('CREATE INDEX IF NOT EXISTS \"apenados_photoHashSha_idx\" ON apenados(\"photoHashSha\")'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoQuality\" DOUBLE PRECISION'),
  p.\$executeRawUnsafe('CREATE INDEX IF NOT EXISTS \"apenados_photoQuality_idx\" ON apenados(\"photoQuality\")'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoCategory\" TEXT'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoCategoryConf\" DOUBLE PRECISION'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoCategoryReason\" TEXT'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoClassifiedAt\" TIMESTAMP(3)'),
  p.\$executeRawUnsafe('CREATE INDEX IF NOT EXISTS \"apenados_photoCategory_idx\" ON apenados(\"photoCategory\")'),
  p.\$executeRawUnsafe('CREATE INDEX IF NOT EXISTS \"apenados_photoClassifiedAt_idx\" ON apenados(\"photoClassifiedAt\")'),
]).then(() => { console.log('Colunas OK'); }).catch(e => { console.error('AVISO colunas:', e.message); }).finally(() => p.\$disconnect());
" || echo "AVISO: script de colunas falhou (nao critico)"

echo "Garantindo suporte pgvector avancado (idempotente)..."
gosu nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
Promise.all([
  p.\$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"faceVector\" vector(512)'),
  p.\$executeRawUnsafe('ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"faceVectorAdvanced\" vector(512)'),
  p.\$executeRawUnsafe('CREATE INDEX IF NOT EXISTS apenados_face_hnsw_idx ON apenados USING hnsw (\"faceVector\" vector_cosine_ops) WITH (m = 32, ef_construction = 128)'),
  p.\$executeRawUnsafe('CREATE INDEX IF NOT EXISTS apenados_face_advanced_hnsw_idx ON apenados USING hnsw (\"faceVectorAdvanced\" vector_cosine_ops) WITH (m = 32, ef_construction = 128)'),
  p.\$executeRawUnsafe('ALTER TABLE mapa_faccoes_vinculos ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT \'MANUAL\''),
  p.\$executeRawUnsafe('ALTER TABLE aparelhos_apreendidos ADD COLUMN IF NOT EXISTS \"criadoPorId\" TEXT'),
  p.\$executeRawUnsafe('ALTER TABLE aparelhos_apreendidos ADD COLUMN IF NOT EXISTS \"editavel\" BOOLEAN DEFAULT false'),
  p.\$executeRawUnsafe('ALTER TABLE aparelhos_apreendidos ADD COLUMN IF NOT EXISTS \"statusEdicao\" VARCHAR(50) DEFAULT \'NORMAL\''),
  p.\$executeRawUnsafe('ALTER TABLE aparelhos_apreendidos ADD COLUMN IF NOT EXISTS \"motivoEdicao\" TEXT'),
]).then(() => { console.log('pgvector avancado OK'); }).catch(e => { console.error('AVISO pgvector:', e.message); }).finally(() => p.\$disconnect());
" || echo "AVISO: pgvector insert falhou (nao critico)"

echo "Garantindo item de sidebar Ordens de Missão (idempotente)..."
gosu nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$executeRawUnsafe(\`
  INSERT INTO sidebar_configs (id, key, label, href, \"iconName\", position, roles, enabled, \"isAdmin\", \"createdAt\", \"updatedAt\")
  SELECT 'cm_ordens_missao_sidebar', 'ordens-missao', 'Ordens de Missão', '/ordens-missao', 'ClipboardList', 49, ARRAY['SUPER_ADMIN','ADMIN','OPERATOR'], true, false, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM sidebar_configs WHERE key = 'ordens-missao')
\`).then(() => { console.log('Sidebar Ordens de Missão OK'); }).catch(e => { console.error('AVISO sidebar:', e.message); }).finally(() => p.\$disconnect());
" || echo "AVISO: sidebar insert falhou (nao critico)"

echo "Garantindo item de sidebar Mapa Faccoes (idempotente)..."
gosu nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$executeRawUnsafe(\`
  INSERT INTO sidebar_configs (id, key, label, href, \"iconName\", position, roles, enabled, \"isAdmin\", \"createdAt\", \"updatedAt\")
  SELECT 'cm_mapa_faccoes_sidebar', 'mapa-faccoes', 'Mapa Facções', '/mapa-faccoes', 'Map', 46, ARRAY['SUPER_ADMIN','ADMIN','OPERATOR'], true, false, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM sidebar_configs WHERE key = 'mapa-faccoes')
\`).then(() => { console.log('Sidebar Mapa Faccoes OK'); }).catch(e => { console.error('AVISO sidebar mapa:', e.message); }).finally(() => p.\$disconnect());
" || echo "AVISO: sidebar mapa insert falhou (nao critico)"

echo "Garantindo item de sidebar Lista de Enderecos (idempotente)..."
gosu nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$executeRawUnsafe(\`
  INSERT INTO sidebar_configs (id, key, label, href, \"iconName\", position, roles, enabled, \"isAdmin\", \"createdAt\", \"updatedAt\")
  SELECT 'cm_lista_enderecos_sidebar', 'lista-enderecos', 'Lista de Endereços', '/lista-enderecos', 'List', 47, ARRAY['SUPER_ADMIN','ADMIN','OPERATOR'], true, false, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM sidebar_configs WHERE key = 'lista-enderecos')
\`).then(() => { console.log('Sidebar Lista de Enderecos OK'); }).catch(e => { console.error('AVISO sidebar enderecos:', e.message); }).finally(() => p.\$disconnect());
" || echo "AVISO: sidebar enderecos insert falhou (nao critico)"

echo "Garantindo tabelas do modulo Arquivo (idempotente)..."
gosu nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
Promise.all([
  p.\$executeRawUnsafe(\`
    CREATE TABLE IF NOT EXISTS \"arquivo_folders\" (
      \"id\" TEXT NOT NULL,
      \"name\" TEXT NOT NULL,
      \"color\" TEXT DEFAULT '#6172f3',
      \"groupId\" TEXT,
      \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT \"arquivo_folders_pkey\" PRIMARY KEY (\"id\")
    )
  \`),
  p.\$executeRawUnsafe(\`
    CREATE TABLE IF NOT EXISTS \"arquivo_files\" (
      \"id\" TEXT NOT NULL,
      \"title\" TEXT NOT NULL,
      \"filename\" TEXT NOT NULL,
      \"originalName\" TEXT NOT NULL,
      \"source\" TEXT,
      \"fileType\" TEXT NOT NULL,
      \"fileSize\" INTEGER NOT NULL,
      \"localPath\" TEXT,
      \"classification\" TEXT NOT NULL DEFAULT 'RESERVADO',
      \"uploadedById\" TEXT NOT NULL,
      \"groupId\" TEXT,
      \"folderId\" TEXT,
      \"notes\" TEXT,
      \"tags\" TEXT[] DEFAULT ARRAY[]::TEXT[],
      \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT \"arquivo_files_pkey\" PRIMARY KEY (\"id\")
    )
  \`),
  p.\$executeRawUnsafe('CREATE INDEX IF NOT EXISTS \"arquivo_files_groupId_idx\" ON \"arquivo_files\"(\"groupId\")'),
  p.\$executeRawUnsafe('CREATE INDEX IF NOT EXISTS \"arquivo_files_folderId_idx\" ON \"arquivo_files\"(\"folderId\")'),
  p.\$executeRawUnsafe(\`
    DO \$\$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                     WHERE constraint_name = 'arquivo_folders_groupId_fkey') THEN
        ALTER TABLE \"arquivo_folders\" ADD CONSTRAINT \"arquivo_folders_groupId_fkey\"
        FOREIGN KEY (\"groupId\") REFERENCES \"groups\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END \$\$
  \`),
  p.\$executeRawUnsafe(\`
    DO \$\$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                     WHERE constraint_name = 'arquivo_files_uploadedById_fkey') THEN
        ALTER TABLE \"arquivo_files\" ADD CONSTRAINT \"arquivo_files_uploadedById_fkey\"
        FOREIGN KEY (\"uploadedById\") REFERENCES \"users\"(\"id\") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END \$\$
  \`),
  p.\$executeRawUnsafe(\`
    DO \$\$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                     WHERE constraint_name = 'arquivo_files_groupId_fkey') THEN
        ALTER TABLE \"arquivo_files\" ADD CONSTRAINT \"arquivo_files_groupId_fkey\"
        FOREIGN KEY (\"groupId\") REFERENCES \"groups\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END \$\$
  \`),
  p.\$executeRawUnsafe(\`
    DO \$\$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                     WHERE constraint_name = 'arquivo_files_folderId_fkey') THEN
        ALTER TABLE \"arquivo_files\" ADD CONSTRAINT \"arquivo_files_folderId_fkey\"
        FOREIGN KEY (\"folderId\") REFERENCES \"arquivo_folders\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END \$\$
  \`),
]).then(() => { console.log('Tabelas Arquivo OK'); }).catch(e => { console.error('AVISO arquivo tables:', e.message); }).finally(() => p.\$disconnect());
" || echo "AVISO: criacao tabelas arquivo falhou (nao critico)"

echo "Garantindo item de sidebar Arquivo (idempotente)..."
gosu nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$executeRawUnsafe(\`
  INSERT INTO sidebar_configs (id, key, label, href, \"iconName\", position, roles, enabled, \"isAdmin\", \"createdAt\", \"updatedAt\")
  SELECT 'cm_arquivo_sidebar', 'arquivo', 'Arquivo', '/arquivo', 'Archive', 31, ARRAY['SUPER_ADMIN','ADMIN','OPERATOR'], true, false, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM sidebar_configs WHERE key = 'arquivo')
\`).then(() => { console.log('Sidebar Arquivo OK'); }).catch(e => { console.error('AVISO sidebar arquivo:', e.message); }).finally(() => p.\$disconnect());
" || echo "AVISO: sidebar arquivo insert falhou (nao critico)"

echo "Iniciando API Python FastAPI em background..."
PYTHONPATH=/app/backend/app gosu nextjs /opt/arcface-venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 &

echo "Iniciando servidor..."
exec gosu nextjs env NODE_OPTIONS="--max-old-space-size=2048" node server.js

