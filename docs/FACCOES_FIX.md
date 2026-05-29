# 🔧 Correção: Importar Facções Retornava Gênero (Masculino/Feminino)

## 🐛 Problema Identificado

A função `scrapeFaccoes()` estava retornando **"Masculino"** e **"Feminino"** em vez dos nomes reais de facções.

### Causa Raiz

O código estava usando múltiplos seletores para encontrar o select de facção:

```typescript
const selectors = [
  'select[name="faccao_id"]',
  'select[name*="faccao"]',
  'select[id*="faccao"]',
  'select:nth-of-type(2)',  // ❌ PERIGOSO: 2º select é GÊNERO, não facção!
  'select'  // ❌ Último recurso: pega qualquer select
]
```

**O problema:**
1. Os seletores específicos (`select[name="faccao_id"]`, etc) falhavam
2. Caía para `select:nth-of-type(2)` → pegava o **2º select da página** = **GÊNERO**
3. Ou caía para `select` genérico → pegava o **1º select** = **GÊNERO**
4. Extraía as opções: **"Masculino"** e **"Feminino"**
5. Salvava como facções no banco de dados

**Estrutura da página do SIPE:**
```html
<form>
  <!-- Outros campos -->
  <select name="sexo">        <!-- 1º SELECT -->
    <option>Masculino</option>
    <option>Feminino</option>
  </select>
  
  <select name="faccao_id">   <!-- 2º SELECT -->
    <option>CV</option>
    <option>PCC</option>
    <option>...</option>
  </select>
</form>
```

## ✅ Solução Implementada

### 1️⃣ Remover Seletor Perigoso
```typescript
// ❌ REMOVER ISTO:
'select:nth-of-type(2)',  // Pode ser qualquer coisa!
'select'                  // Muito genérico!
```

### 2️⃣ Adicionar Validação de Tipo
```typescript
// ✅ ADICIONAR ISTO:
// Verificar se o select é realmente de facção
const testOptions = await elem.locator('option').evaluateAll((opts: HTMLOptionElement[]) =>
  opts
    .filter((o) => o.value && o.value !== '0' && o.value !== '')
    .map((o) => o.textContent?.trim() ?? '')
)

// Descartar se tem gênero
const hasGender = testOptions.some(opt =>
  opt.toLowerCase().includes('masculino') ||
  opt.toLowerCase().includes('feminino') ||
  opt.toLowerCase().includes('não informado')
)

if (hasGender) {
  console.log(`⚠️ "${sel}" é select de gênero, descartando...`)
  continue // Pula este seletor
}
```

### 3️⃣ Validação Final
```typescript
// ✅ Garantir que o resultado é realmente facção
const hasGenderInFinal = options.some(opt =>
  opt.text.toLowerCase().includes('masculino') ||
  opt.text.toLowerCase().includes('feminino')
)

if (hasGenderInFinal) {
  throw new Error('Select contém gênero, não é facção!')
}
```

## 📊 Comparação Antes/Depois

### ❌ ANTES (Bugado)
```
scrapeFaccoes() executado
  ↓
Procura select[name="faccao_id"] → NÃO ENCONTRA
Procura select[name*="faccao"] → NÃO ENCONTRA
Procura select[id*="faccao"] → NÃO ENCONTRA
Procura select:nth-of-type(2) → ENCONTRA (mas é GÊNERO!)
Extrai opções: ["Masculino", "Feminino"]
Salva no banco como facções ❌
  ↓
Resultado: Abas de Facções mostra "Masculino" e "Feminino"
```

### ✅ DEPOIS (Corrigido)
```
scrapeFaccoes() executado
  ↓
Procura select[name="faccao_id"] → NÃO ENCONTRA
Procura select[name*="faccao"] → NÃO ENCONTRA
Procura select[id*="faccao"] → NÃO ENCONTRA
Procura select → ENCONTRA (1º select)
  Verifica opções: ["Masculino", "Feminino"]
  Detecta gênero! ⚠️ Descarta
Procura próximo select → ENCONTRA (2º select)
  Verifica opções: ["CV", "PCC", "TCP", ...]
  Sem gênero! ✅ Usa este!
Extrai opções: ["CV", "PCC", "TCP", ...]
Salva no banco como facções ✅
  ↓
Resultado: Abas de Facções mostra "CV", "PCC", "TCP", etc
```

## 🚀 Como Aplicar a Correção

### Local (Desenvolvimento)
```bash
git add src/lib/sipe-scraper.ts
git commit -m "fix: Corrigir extração de facções (remover Masculino/Feminino)"
npm run build
npm run dev
```

### Produção (Coolify)
```bash
git push origin main
# Webhook do Coolify redeploy automaticamente
```

## 🧪 Como Testar

### 1️⃣ Limpar Facções Antigas
```sql
-- Backup antes
SELECT * FROM sipe_faccoes WHERE nome IN ('Masculino', 'Feminino');

-- Deletar as facções erradas
DELETE FROM sipe_faccoes WHERE nome IN ('Masculino', 'Feminino');
```

### 2️⃣ Executar Sincronização
```bash
POST http://localhost:3000/api/sipe/sync
{
  "tipo": "FACCOES"
}
```

### 3️⃣ Verificar Resultado
```bash
GET http://localhost:3000/api/sipe/faccoes
```

**Resultado esperado:**
```json
[
  { "sipeId": 1, "nome": "CV", "ativa": true },
  { "sipeId": 2, "nome": "PCC", "ativa": true },
  { "sipeId": 3, "nome": "TCP", "ativa": true },
  ...
]
```

**❌ NÃO deve ter:**
```json
{ "sipeId": 999, "nome": "Masculino" }
{ "sipeId": 1000, "nome": "Feminino" }
```

## 📈 Impacto na Funcionalidade de Apenados

### ✅ Extração de Facção por Apenado
A função `scrapeApenadoFicha()` já estava correta:
```typescript
faccaoSipeId:
  parseInt(
    document.querySelector('[name="faccao_id"]') as HTMLInputElement
  ?.value || '0'
  ) || null,
```

Este código procura por um **input hidden com name="faccao_id"**, que tem o ID numérico da facção. Funciona porque:
- ✅ É bem específico (name="faccao_id")
- ✅ Procura um input hidden, não um select visível
- ✅ Retorna um ID numérico (ex: "1", "2", "3")

Depois resolve o ID para o nome real:
```typescript
const faccao = await prisma.sipeFaccao.findUnique({
  where: { sipeId: dados.faccaoSipeId }
})
faccaoId = faccao?.id ?? null
```

### ✅ Agora Funciona Corretamente
1. `scrapeApenadoFicha()` extrai `faccaoSipeId` (ID numérico) ✅
2. Procura no banco por `sipeFaccao.sipeId` ✅
3. Obtém o `faccaoId` correto ✅
4. Salva como relacionamento no banco ✅

## 🔍 Logs Esperados Após Correção

Quando executar `scrapeFaccoes()`:
```
[FACCOES] 🔍 Iniciando scrape de facções...
[FACCOES] 📄 Tentativa 1/5 - Acessando /apenados/index...
[FACCOES] 🔗 Encontrados 47 links de apenados
[FACCOES] ✓ Apenado ID extraído: 123456
[FACCOES] 🖱️ Clicando no link do apenado...
[FACCOES] 🔄 Tentativa 1: Acessando /apenados/123456/faccao...
[FACCOES] 🔎 Seletor "select[name="faccao_id"]" encontrado com opções: CV, PCC, TCP
[FACCOES] 🔎 Seletor "select[name*="faccao"]" encontrado com opções: CV, PCC, TCP
[FACCOES] ✅ Select de FACÇÃO encontrado com seletor: select[name*="faccao"]
[FACCOES] ✓ Select de facção confirmado
[FACCOES] 📊 Facções encontradas: 3
[FACCOES] 📋 Primeiras: CV, PCC, TCP
[FACCOES] ✅ Sucesso na tentativa 1!
[FACCOES] 💾 Salvando 3 facções no banco...
[FACCOES] ✅ 3 facções salvas com sucesso
```

**NÃO deve ter:**
```
⚠️ "select" é select de gênero (tem Masculino/Feminino), descartando...
```

## 📝 Resumo da Mudança

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Seletores usados** | `select:nth-of-type(2)`, `select` genérico | `select[name...]`, `select[id...]`, `select` com validação |
| **Validação** | Nenhuma | Verifica se tem "Masculino"/"Feminino" |
| **Resultado** | Masculino, Feminino | CV, PCC, TCP, ... (facções reais) |
| **Segurança** | Baixa (pega qualquer select) | Alta (valida conteúdo) |

## 🎯 Arquivo Modificado

**`src/lib/sipe-scraper.ts`**
- ✅ Linha ~1694-1745: Tentativa 1 (página /faccao)
- ✅ Linha ~1747-1798: Tentativa 2 (página /editar)
- ✅ Removido: seletores perigosos
- ✅ Adicionado: validação de tipo (verificar gênero)

## ❓ FAQ

**P: Por que antes estava usando `select:nth-of-type(2)`?**  
R: Era uma tentativa de evitar o 1º select (gênero). Mas não funciona em todos os casos, pois a estrutura HTML pode variar.

**P: E se o nome da facção contiver "masculino" ou "feminino"?**  
R: Improvável, mas a validação é case-insensitive e genérica. Se houver facção com esse nome, pode ser um falso positivo. Seria necessário melhorar a regex.

**P: Preciso fazer algo manualmente?**  
R: Sim, se houver "Masculino" e "Feminino" no banco:
```sql
DELETE FROM sipe_faccoes WHERE nome IN ('Masculino', 'Feminino');
```

**P: O scraping de apenados também será afetado?**  
R: Não! `scrapeApenadoFicha()` usa `document.querySelector('[name="faccao_id"]')` que é bem específico e já estava funcionando.

---

**Commit:** 
```
fix: Corrigir extração de facções retornando Masculino/Feminino

- Remove seletores perigosos (select:nth-of-type, select genérico)
- Adiciona validação para descartar select de gênero
- Verifica se opções contêm "Masculino"/"Feminino" antes de usar
- Validação final garante que resultado é realmente facção

Fixes: Importar Facções retornava apenas Masculino/Feminino
```
