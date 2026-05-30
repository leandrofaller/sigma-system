# 🔍 Diagnóstico: Por que Capsolver Não Funciona

## O Problema Encontrado

Rodei o script `validate-capsolver.ts` e o resultado foi muito revelador:

### Erro Crítico
```
ERROR: invalid task data: invalid websiteKey, its length should be 40
```

**Causa raiz:** A chave reCAPTCHA extraída do CNA **NÃO TEM 40 CARACTERES** (que é o requisito obrigatório do Capsolver).

---

## Detalhes do Erro

### O que Capsolver exige:
- ✅ Chave reCAPTCHA **EXATAMENTE 40 caracteres**
- ✅ Chaves válidas: `6LeVE7sqqAAAAAJKhjR1KDX5SsWC1yqR0I_MF8Hv` (40 chars)

### O que o código estava fazendo:
- ❌ Validava chaves com `>= 35 caracteres`
- ❌ Regex capturava strings muito longas ou muito curtas
- ❌ Sem log da chave extraída para debug

---

## Solução Implementada

### 1️⃣ **Validação Corrigida** (src/lib/capsolver-service.ts)

**Antes:**
```typescript
if (key && key.length >= 35) return key  // ❌ Muito flexível
```

**Depois:**
```typescript
if (key && key.length === 40) return key  // ✅ Exatamente 40
```

**Regex corrigido:**
```typescript
// Antes: [a-zA-Z0-9_-]+ (qualquer tamanho)
// Depois: [a-zA-Z0-9_-]{40} (exatamente 40)
const match = src.match(/[?&]k=([a-zA-Z0-9_-]{40})/)
```

### 2️⃣ **Melhorias de Logging**

Agora mostra exatamente qual é o problema:

**Se chave tem tamanho errado:**
```
[Capsolver] ⚠️ Chaves encontradas mas com tamanho inválido:
  - iframe src: 35 chars (esperado 40)
  - data-sitekey: 42 chars (esperado 40)
```

**Se Capsolver retorna erro:**
```json
{
  "errorId": 1,
  "errorCode": "ERROR_INVALID_TASK_DATA",
  "errorDescription": "invalid task data: invalid websiteKey, its length should be 40",
  "websiteKeyLength": 35
}
```

### 3️⃣ **Validação Prévia**

Antes de tentar resolver, valida:
```typescript
if (!sitekey || sitekey.length !== 40) {
  console.error(`[Capsolver] ❌ Sitekey inválido: ${sitekey.length} chars`)
  console.error(`[Capsolver] Capsolver exige EXATAMENTE 40 caracteres`)
  return null
}
```

---

## Próximos Passos

### 1. Verificar se o CNA tem reCAPTCHA v3

A detecção depende de encontrar a chave no DOM do CNA. Se não encontrar, pode ser:

- ❌ **reCAPTCHA não está presente** na página (site não usa)
- ❌ **reCAPTCHA v2** (Capsolver suporta, mas é diferente)
- ❌ **hCaptcha** (não é reCAPTCHA, Capsolver pode não suportar)
- ❌ **Outro tipo de CAPTCHA** (Imperva, Cloudflare, etc.)

**Solução:** O script `validate-capsolver.ts` agora mostrará qual chave foi encontrada e qual é o tamanho.

### 2. Configurar Capsolver para reCAPTCHA Correto

Se o CNA usa reCAPTCHA v3 (que é o tipo mais moderno), o Capsolver vai resolver:

```typescript
task: {
  type: 'ReCaptchaV3TaskProxyless',  // ✅ Correto para v3
  websiteURL: 'https://cna.oab.org.br/',
  websiteKey: sitekey,  // Deve ter 40 chars
  pageAction: 'submit',
}
```

---

## Como Testar Agora

### 1. Rodar script de diagnóstico
```bash
npx tsx scripts/validate-capsolver.ts
```

**Possíveis resultados:**

| Resultado | Significado |
|-----------|------------|
| ✅ CAPSOLVER FUNCIONANDO | Tudo OK! Problem está em detecção de chave |
| ❌ HTTP 400 (40 chars) | Chave tem tamanho errado |
| ❌ HTTP 401 | API key inválida/expirada |
| ❌ HTTP 429 | Rate limit - aguarde |
| ❌ ERROR_INVALID_TASK_DATA | URL ou chave malformadas |

### 2. Se script falhar com "40 chars"
Significa que a chave reCAPTCHA do CNA não tem 40 caracteres. Pode ser:
- reCAPTCHA v2 (tamanho diferente)
- Outro tipo de CAPTCHA
- Detecção falhou

**Ação:** Inspecione manualmente o HTML da página CNA para encontrar a chave correta.

### 3. Se script passar ✅
Significa Capsolver funciona. O problema está em detectar a chave no CNA.

**Ação:** Melhorar detecção de chave (Etapa 2).

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/lib/capsolver-service.ts` | Validação 40 chars + melhor logging |
| `scripts/validate-capsolver.ts` | Script de diagnóstico (novo) |

---

## Resumo

| Antes | Depois |
|-------|--------|
| ❌ Validava >= 35 chars | ✅ Valida == 40 chars |
| ❌ Sem log de chave | ✅ Log detalhado de chave |
| ❌ Sem ferramenta de diagnóstico | ✅ `validate-capsolver.ts` |
| ❌ Erro genérico | ✅ Erro com contexto completo |

---

## Próxima Etapa

Se `validate-capsolver.ts` passar ✅, o problema não é Capsolver, é:
1. **Detecção de chave** - Não consegue encontrar chave no DOM do CNA
2. **Tipo de CAPTCHA** - CNA pode usar reCAPTCHA v2 ou outro tipo
3. **Injeção de token** - Consegue resolver mas não consegue injetar

Cada um tem uma solução diferente. Primeiro teste com `validate-capsolver.ts`!
