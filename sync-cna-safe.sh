#!/bin/bash
# Wrapper seguro para sincronização CNA
# Garante que apenas uma sincronização rode por vez

cd "$(dirname "$0")"
npx tsx scripts/sync-cna-safe.ts
