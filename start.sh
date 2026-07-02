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
gosu nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function run() {
  const steps = [
    // ── Extensoes ──────────────────────────────────────────────────────────────
    ['ext unaccent',   'CREATE EXTENSION IF NOT EXISTS unaccent'],
    ['fn unaccent',    \`CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS \\\$\\\$SELECT public.unaccent('public.unaccent', \\\$1)\\\$\\\$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT\`],
    ['ext vector',     'CREATE EXTENSION IF NOT EXISTS vector'],

    // ── Colunas de auditoria / OCR ─────────────────────────────────────────────
    ['ocr ocrText',    'ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"ocrText\" TEXT'],
    ['ocr ocrName',    'ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"ocrName\" TEXT'],
    ['ocr hashSha',    'ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoHashSha\" VARCHAR(64)'],
    ['idx hashSha',    'CREATE INDEX IF NOT EXISTS \"apenados_photoHashSha_idx\" ON apenados(\"photoHashSha\")'],
    ['ocr quality',    'ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoQuality\" DOUBLE PRECISION'],
    ['idx quality',    'CREATE INDEX IF NOT EXISTS \"apenados_photoQuality_idx\" ON apenados(\"photoQuality\")'],
    ['ocr category',   'ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoCategory\" TEXT'],
    ['ocr categoryConf','ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoCategoryConf\" DOUBLE PRECISION'],
    ['ocr categoryReason','ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoCategoryReason\" TEXT'],
    ['ocr classifiedAt','ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"photoClassifiedAt\" TIMESTAMP(3)'],
    ['idx category',   'CREATE INDEX IF NOT EXISTS \"apenados_photoCategory_idx\" ON apenados(\"photoCategory\")'],
    ['idx classifiedAt','CREATE INDEX IF NOT EXISTS \"apenados_photoClassifiedAt_idx\" ON apenados(\"photoClassifiedAt\")'],

    // ── pgvector: colunas ──────────────────────────────────────────────────────
    ['vec faceVector',     'ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"faceVector\" vector(512)'],
    ['vec faceVectorAdv',  'ALTER TABLE apenados ADD COLUMN IF NOT EXISTS \"faceVectorAdvanced\" vector(512)'],
    ['vec visitante',      'ALTER TABLE sipe_visitantes ADD COLUMN IF NOT EXISTS \"faceVector\" vector(512)'],

    // ── Outras colunas ─────────────────────────────────────────────────────────
    ['mapa origem',        'ALTER TABLE mapa_faccoes_vinculos ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT \'MANUAL\''],
    ['ap criadoPorId',     'ALTER TABLE aparelhos_apreendidos ADD COLUMN IF NOT EXISTS \"criadoPorId\" TEXT'],
    ['ap editavel',        'ALTER TABLE aparelhos_apreendidos ADD COLUMN IF NOT EXISTS \"editavel\" BOOLEAN DEFAULT false'],
    ['ap statusEdicao',    'ALTER TABLE aparelhos_apreendidos ADD COLUMN IF NOT EXISTS \"statusEdicao\" VARCHAR(50) DEFAULT \'NORMAL\''],
    ['ap motivoEdicao',    'ALTER TABLE aparelhos_apreendidos ADD COLUMN IF NOT EXISTS \"motivoEdicao\" TEXT'],

    // ── pgvector: indices HNSW (m=8 conserva memoria) ─────────────────────────
    ['hnsw faceVector',    'CREATE INDEX IF NOT EXISTS apenados_face_hnsw_idx ON apenados USING hnsw (\"faceVector\" vector_cosine_ops) WITH (m = 8, ef_construction = 32)'],
    ['hnsw faceVectorAdv', 'CREATE INDEX IF NOT EXISTS apenados_face_adv_hnsw_idx ON apenados USING hnsw (\"faceVectorAdvanced\" vector_cosine_ops) WITH (m = 8, ef_construction = 32)'],

    // ── Tabelas do modulo Arquivo ──────────────────────────────────────────────
    ['arquivo_folders tbl', \`CREATE TABLE IF NOT EXISTS \"arquivo_folders\" (
      \"id\" TEXT NOT NULL,
      \"name\" TEXT NOT NULL,
      \"color\" TEXT DEFAULT '#6172f3',
      \"groupId\" TEXT,
      \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT \"arquivo_folders_pkey\" PRIMARY KEY (\"id\")
    )\`],
    ['arquivo_files tbl', \`CREATE TABLE IF NOT EXISTS \"arquivo_files\" (
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
    )\`],
    ['idx arquivo groupId',  'CREATE INDEX IF NOT EXISTS \"arquivo_files_groupId_idx\" ON \"arquivo_files\"(\"groupId\")'],
    ['idx arquivo folderId', 'CREATE INDEX IF NOT EXISTS \"arquivo_files_folderId_idx\" ON \"arquivo_files\"(\"folderId\")'],
    ['fk arquivo_folders group', \`DO \\\$\\\$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'arquivo_folders_groupId_fkey') THEN
        ALTER TABLE \"arquivo_folders\" ADD CONSTRAINT \"arquivo_folders_groupId_fkey\" FOREIGN KEY (\"groupId\") REFERENCES \"groups\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END \\\$\\\$\`],
    ['fk arquivo_files user', \`DO \\\$\\\$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'arquivo_files_uploadedById_fkey') THEN
        ALTER TABLE \"arquivo_files\" ADD CONSTRAINT \"arquivo_files_uploadedById_fkey\" FOREIGN KEY (\"uploadedById\") REFERENCES \"users\"(\"id\") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END \\\$\\\$\`],
    ['fk arquivo_files group', \`DO \\\$\\\$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'arquivo_files_groupId_fkey') THEN
        ALTER TABLE \"arquivo_files\" ADD CONSTRAINT \"arquivo_files_groupId_fkey\" FOREIGN KEY (\"groupId\") REFERENCES \"groups\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END \\\$\\\$\`],
    ['fk arquivo_files folder', \`DO \\\$\\\$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'arquivo_files_folderId_fkey') THEN
        ALTER TABLE \"arquivo_files\" ADD CONSTRAINT \"arquivo_files_folderId_fkey\" FOREIGN KEY (\"folderId\") REFERENCES \"arquivo_folders\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END \\\$\\\$\`],

    // ── Sidebar: itens fixos ───────────────────────────────────────────────────
    ['sidebar ordens-missao', \`INSERT INTO sidebar_configs (id, key, label, href, \"iconName\", position, roles, enabled, \"isAdmin\", \"createdAt\", \"updatedAt\")
      SELECT 'cm_ordens_missao_sidebar','ordens-missao','Ordens de Missão','/ordens-missao','ClipboardList',49,ARRAY['SUPER_ADMIN','ADMIN','OPERATOR'],true,false,NOW(),NOW()
      WHERE NOT EXISTS (SELECT 1 FROM sidebar_configs WHERE key = 'ordens-missao')\`],
    ['sidebar mapa-faccoes', \`INSERT INTO sidebar_configs (id, key, label, href, \"iconName\", position, roles, enabled, \"isAdmin\", \"createdAt\", \"updatedAt\")
      SELECT 'cm_mapa_faccoes_sidebar','mapa-faccoes','Mapa Facções','/mapa-faccoes','Map',46,ARRAY['SUPER_ADMIN','ADMIN','OPERATOR'],true,false,NOW(),NOW()
      WHERE NOT EXISTS (SELECT 1 FROM sidebar_configs WHERE key = 'mapa-faccoes')\`],
    ['sidebar lista-enderecos', \`INSERT INTO sidebar_configs (id, key, label, href, \"iconName\", position, roles, enabled, \"isAdmin\", \"createdAt\", \"updatedAt\")
      SELECT 'cm_lista_enderecos_sidebar','lista-enderecos','Lista de Endereços','/lista-enderecos','List',47,ARRAY['SUPER_ADMIN','ADMIN','OPERATOR'],true,false,NOW(),NOW()
      WHERE NOT EXISTS (SELECT 1 FROM sidebar_configs WHERE key = 'lista-enderecos')\`],
    ['sidebar arquivo', \`INSERT INTO sidebar_configs (id, key, label, href, \"iconName\", position, roles, enabled, \"isAdmin\", \"createdAt\", \"updatedAt\")
      SELECT 'cm_arquivo_sidebar','arquivo','Arquivo','/arquivo','Archive',31,ARRAY['SUPER_ADMIN','ADMIN','OPERATOR'],true,false,NOW(),NOW()
      WHERE NOT EXISTS (SELECT 1 FROM sidebar_configs WHERE key = 'arquivo')\`],
  ];

  let ok = 0; let warn = 0;
  for (const [name, sql] of steps) {
    try { await p.\$executeRawUnsafe(sql); ok++; }
    catch (e) { console.error('  AVISO [' + name + ']:', e.message.split('\n')[0]); warn++; }
  }
  console.log('Setup DB concluido: ' + ok + ' OK, ' + warn + ' avisos.');
}

run().finally(() => p.\$disconnect());
" || echo "AVISO: setup do banco falhou (nao critico)"

echo "Iniciando API Python FastAPI em background..."
PYTHONPATH=/app/backend/app gosu nextjs /opt/arcface-venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 &

echo "Iniciando servidor..."
exec gosu nextjs env NODE_OPTIONS="--max-old-space-size=2048" node server.js
