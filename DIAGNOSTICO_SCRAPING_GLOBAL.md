# 🔍 Diagnóstico: Scraping Global - Regressão de 2900 Registros

## Problema Relatado
Scraping Global agora coleta apenas **2900 registros** contra o anterior que pegava mais.

## Possíveis Causas

### 1. **Limite na Paginação** (Mais Provável)
- Arquivo: `src/lib/sipe-scraper.ts` linha 1483
- Código: `const MAX_VAZIAS = 3`
- Se houver 3 páginas consecutivas sem novos IDs, para.
- **2900** = aprox. 5.8 páginas de 500 registros cada

### 2. **Timeout Durante Scraping**
- Arquivo: `src/lib/sipe-scraper.ts` linha 1511
- Delay entre páginas: `1000 + Math.random() * 2000` ms (1-3s)
- Pode estar excedendo tempo total disponível

### 3. **Erro na Extração de `unidadeFicha`**
- Minha mudança faz passar `job.unidadeNome = null`
- Função `scrapeApenadoFicha()` tenta extrair de `dados.unidadeFicha`
- Se falhar em extrair, pode causar erro silencioso

---

## 🧪 Como Diagnosticar

### Step 1: Verificar o Log do Job no Banco

```sql
SELECT 
  id,
  tipo,
  status,
  total,
  processado,
  log,
  fase,
  iniciadoEm,
  finalizadoEm
FROM "SipeSyncJob"
WHERE tipo = 'GLOBAL'
ORDER BY createdAt DESC
LIMIT 5;
```

**Procure por:**
- ✅ `total` vs `processado` — se são iguais, coleta OK mas scraping parou
- ⚠️ Mensagens de erro no `log`
- ⏱️ `finalizadoEm - iniciadoEm` — quanto tempo levou?

### Step 2: Checar Quantidade de Apenados Importados Recentes

```sql
SELECT COUNT(*) as total
FROM "sipe_apenados_importados"
WHERE "updatedAt" > NOW() - INTERVAL '1 day'
```

**Esperado:** Próximo ao `total` do job

### Step 3: Rodar Scraping Global Novamente com Monitoramento

1. Abra o painel de sincronização
2. Clique em "Scraping Global"
3. **Monitore em tempo real:**
   - Quantos apenados por página?
   - Há pausa entre páginas?
   - Alguma mensagem de erro?

### Step 4: Checar os Logs do Servidor

```bash
# Se usando Docker:
docker logs sigma-system 2>&1 | grep -i "global\|2900\|estratégia" | tail -50

# Se local:
tail -100 /var/log/node.log | grep -i "global"
```

---

## 🔧 Possível Fix

Se o problema for o `MAX_VAZIAS` limitando prematuramente:

### Opção A: Aumentar o Limite de Páginas Vazias
```typescript
// Antes:
const MAX_VAZIAS = 3

// Depois:
const MAX_VAZIAS = 5  // ou 10
```

### Opção B: Remover o Limite para GLOBAL
```typescript
// Na linha 1483, dentro de coletarIdsApenados:
let MAX_VAZIAS = 3
if (globalMode) {
  MAX_VAZIAS = 50  // Para GLOBAL, permite muito mais páginas vazias
}
```

### Opção C: Diagnosticar por Página
```typescript
log(jobId, `📄 Página ${pageNum}: +${novos} IDs (empty_count: ${emptyConsecutivos}/${MAX_VAZIAS})`)
```

---

## ⚙️ Minha Mudança Afeta Isso?

**Resumo da mudança que fiz:**
- Linha 190 de `route.ts`: `'Todas as Unidades (Global)'` → `null`

**Fluxo afetado:**
```
POST /api/sipe/sync (tipo='GLOBAL')
  ↓
SipeSyncJob.unidadeNome = null  (era 'Todas as Unidades (Global)')
  ↓
startSipeSync(jobId, 'GLOBAL')
  ↓
runScrape() → coletarIdsApenados(page, 'GLOBAL', jobId, null, true)
             → COLETA: null e true passados (SEM MUDANÇA)
             ↓
           scrapeApenadoFicha(page, sipeId, job.unidadeNome=null, true)
             → SCRAPING: agora unidadeNome=null (MUDANÇA!)
```

**Impacto:**
- ❌ **NÃO afeta coleta** (já passava null antes)
- ⚠️ **PODE afetar scraping** se `dados.unidadeFicha` falhar

---

## 📊 Checklist de Investigação

- [ ] Verificar log do job no banco (veja Sql acima)
- [ ] Confirmar se coleta pegou 2900 ou se scraping parou em 2900
- [ ] Rodar novamente e monitorar logs do servidor
- [ ] Comparar com scraping anterior (antes da mudança)
- [ ] Verificar se há mensagens de timeout ou erro

---

## 🚨 Se Tiver Problema Confirmado

**Próximas ações:**
1. Passe-me o log do job (Sql query acima)
2. Quantos apenados há no total no SIPE?
3. A coleta pegou 2900 ou o scraping parou em 2900?

Com essas infos, consigo fazer o fix certo!

---

## 📌 Referências de Código

**Coletando IDs** (linha 1135-1542):
- Estratégia A: DataTables JS API (client-side)
- Estratégia B: Fetch direto com paginação (API)
- Estratégia C: DOM + clique em páginas

**Scrapeando Fichas** (linha 1546-2084):
- Extrai `unidade` de `dados.unidadeFicha` (HTML)
- Usa `unidadeNome` como fallback (agora null para GLOBAL)
- Salva em `SipeApenadoImportado`

---

**Status: 🟡 INVESTIGANDO**

Quando rodar os diagnósticos, me passe os resultados!
