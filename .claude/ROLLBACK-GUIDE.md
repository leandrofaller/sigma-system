# 🔄 Guia de Rollback - Paralelização do Scraper SIPE

## 📌 Situação Atual

**Branch**: `main` (com paralelização implementada)
**Data**: 2026-06-02
**Mudanças**: Múltiplos contexts em paralelo (8 workers)

---

## 🚨 Se algo der errado...

### **Opção 1: Reverter para o código original (RECOMENDADO)**

```bash
# Opção A: Via Git (mais seguro)
cd F:\relatorio_claude
git checkout backup/sipe-scraper-original-sequencial
# Verifica que voltou:
git log --oneline -5

# Depois pode voltar para main:
git checkout main
```

### **Opção 2: Usar arquivo backup literal**

```bash
# Restaurar do arquivo backup
cp F:\relatorio_claude\src\lib\sipe-scraper.ts.backup-original-2026-06-02 \
   F:\relatorio_claude\src\lib\sipe-scraper.ts

# IDE vai recarregar automaticamente
```

### **Opção 3: Reverter commit específico**

```bash
cd F:\relatorio_claude

# Ver commits recentes
git log --oneline -10

# Reverter o último commit (cria novo commit)
git revert HEAD

# Ou resetar para commit anterior (destrutivo)
git reset --hard <commit-hash>
```

---

## 📋 Backups Criados

| Item | Localização | Tipo | Uso |
|------|------------|------|-----|
| **Branch** | `backup/sipe-scraper-original-sequencial` | Git | Primary backup |
| **Arquivo** | `src/lib/sipe-scraper.ts.backup-original-2026-06-02` | File | Fallback |
| **Commit** | `3c1f9b1` (veja com `git log`) | History | Reference |

---

## ✅ Verificação de Rollback

Após reverter, confirme que está OK:

```bash
# 1. Verificar branch
git branch -v

# 2. Verificar arquivo
head -50 src/lib/sipe-scraper.ts | grep "// Passo"
# Se sair "// Passo 1: Context Pool" = NÃO reverteu
# Se sair vazio = reverteu OK

# 3. Comparar com backup
diff src/lib/sipe-scraper.ts src/lib/sipe-scraper.ts.backup-original-2026-06-02
# Se não houver output = arquivos idênticos = OK
```

---

## 🔍 O que foi modificado

### Arquivos alterados:
- ✏️ `src/lib/sipe-scraper.ts` (novo: context pool + paralelização)

### Arquivo importado:
- ➕ `async-lock` (package.json) — para sincronização de state

### Sem alterações:
- ✅ Schemas Prisma
- ✅ APIs
- ✅ Funcionalidades de scraping individual

---

## 💬 Comandos Rápidos

```bash
# Ver qual branch está
git branch -v

# Listar todos backups
git branch | grep backup

# Diferença visual
git diff backup/sipe-scraper-original-sequencial src/lib/sipe-scraper.ts

# Limpar branches antigos (CUIDADO)
git branch -D backup/sipe-scraper-original-sequencial
```

---

## ⚠️ IMPORTANTE

- **Backup será mantido indefinidamente** — não será deletado automaticamente
- **Arquivo `.backup-original-2026-06-02` é imutável** — mesmo que delete o código novo
- **Git log tem histórico completo** — mesmo que delete branches

**Você está seguro.** 🛡️
