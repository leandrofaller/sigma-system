# 🧪 Como Testar Capsolver Manualmente

## O Problema Identificado

O script de diagnóstico revelou que **Capsolver requer chaves reCAPTCHA com EXATAMENTE 40 caracteres**. As melhorias no código foram feitas, mas agora preciso que você teste com a **chave real do CNA**.

---

## Passo 1: Encontrar a Chave reCAPTCHA Real do CNA

### Opção A: Via Inspetor de Elementos (Browser)

1. Abra https://cna.oab.org.br
2. Pressione **F12** (Desenvolvedor)
3. Vá para a aba **Elements** (ou **Inspector**)
4. Procure por um destes padrões:

**Padrão 1: `data-sitekey`**
```html
<div data-sitekey="6LeVE7sqqAAAAA..."></div>
```

**Padrão 2: `iframe` com `k=`**
```html
<iframe src="https://www.google.com/recaptcha/api2/anchor?k=6LeVE7sqqAAAAA..."></iframe>
```

**Padrão 3: JavaScript**
```javascript
grecaptcha.render('container', {
  sitekey: '6LeVE7sqqAAAAA...'
})
```

5. Copie a chave (deve ter **EXATAMENTE 40 caracteres**)

---

## Passo 2: Testar com Script Modificado

### Editar `scripts/validate-capsolver.ts`

Procure pela linha que tem:
```typescript
websiteKey: '6LeVE7sqqAAAAAJKhjR1KDX5SsWC1yqR0I_MF8Hv',
```

**Substitua pela chave real encontrada no CNA:**
```typescript
websiteKey: 'COLE_A_CHAVE_ENCONTRADA_AQUI', // Deve ter 40 chars
```

**Valide o tamanho:**
```bash
# Linux/Mac
echo -n "COLE_A_CHAVE_AQUI" | wc -c

# Windows PowerShell
$key = "COLE_A_CHAVE_AQUI"; $key.Length
```

Deve retornar: `40`

### Rodar o teste
```bash
npx tsx scripts/validate-capsolver.ts
```

---

## Passo 3: Interpretar Resultados

### ✅ Se vir: "CAPSOLVER FUNCIONANDO!"
```
✅ CAPSOLVER ESTÁ FUNCIONANDO CORRETAMENTE!
Você pode agora rodar a sincronização CNA com confiança.
```

**Ação:** Capsolver funciona! O problema pode estar em:
- Detectar a chave no DOM do CNA
- Injetar o token corretamente
- Tipo de CAPTCHA (pode ser v2 em vez de v3)

---

### ❌ Se vir: "invalid websiteKey"
```
Erro: invalid task data: invalid websiteKey, its length should be 40
```

**Possíveis causas:**
1. Chave tem tamanho errado (não 40 chars)
2. Chave é de outro site, não do CNA
3. CNA usa reCAPTCHA v2 (tamanho diferente)

**Ação:**
- Verifique o tamanho: deve ser **EXATAMENTE 40**
- Se menor: pode ser chave de formulário diferente
- Se maior: pode ser reCAPTCHA v2 ou outro tipo

---

### ❌ Se vir: "ERROR_INVALID_TASK_DATA"
```
Erro no polling: ERROR_INVALID_TASK_DATA
```

**Possível causa:** Chave é válida no formato, mas não corresponde a https://cna.oab.org.br

**Ação:**
- Verifique se a chave foi extraída corretamente
- Confirme que é do site cna.oab.org.br e não outro site

---

### ❌ Se vir: "401 Unauthorized"
```
HTTP 401 Unauthorized
MOTIVO: API key inválida ou expirada
```

**Ação:**
- Verifique sua API key em https://www.capsolver.com/dashboard/account
- Certifique-se de que está configurada em `.env`
- Teste se tem saldo/créditos

---

## Passo 4: Próximos Passos Baseado no Resultado

### Cenário 1: Capsolver funciona (✅)
Se o script passou, o problema não é Capsolver. É sobre:
- **Detectar a chave** no DOM do CNA durante acesso real
- **Tipo de CAPTCHA** que o CNA usa
- **Injetar o token** corretamente

**Ação:** Vou implementar Etapa 2 do plano (melhor detecção de chave).

---

### Cenário 2: Chave tem tamanho errado (❌ 40 chars)
Se a chave real do CNA não tem 40 caracteres:

**Pode ser reCAPTCHA v2 (tamanho diferente)**
```typescript
// Em vez de v3:
type: 'ReCaptchaV3TaskProxyless',

// Seria v2:
type: 'ReCaptchaV2TaskProxyless',
```

**Ação:** Preciso adicionar suporte a reCAPTCHA v2 também.

---

### Cenário 3: Sempre dá erro (❌)
Se o script continue falhando:
- Capsolver pode estar indisponível
- API key pode estar com problema
- CNA pode estar bloqueando Capsolver

**Ação:** Explorar alternativas (outros serviços de CAPTCHA).

---

## Ferramentas Úteis

### Contar caracteres da chave
```bash
# Bash/PowerShell
$key = "sua_chave_aqui"; Write-Host $key.Length

# Ou online
https://www.charactercounttool.com/
```

### Validar chave reCAPTCHA
```bash
# Testar se chave é válida
curl -X POST https://www.google.com/recaptcha/api/siteverify \
  -d "secret=SECRET_KEY&response=TOKEN"
```

### Verificar saldo Capsolver
```bash
https://www.capsolver.com/dashboard/account
```

---

## Resumo do Processo

```
1. Encontrar chave reCAPTCHA real do CNA
   ↓
2. Validar tamanho (40 chars)
   ↓
3. Editar scripts/validate-capsolver.ts
   ↓
4. Rodar: npx tsx scripts/validate-capsolver.ts
   ↓
5. Interpretar resultado
   ↓
6. Reportar para próxima etapa
```

---

## O que Esperar Depois

### Se Capsolver funcionar ✅
- Implement Etapa 2: Melhor logging + retry
- Melhorar detecção de chave no DOM real do CNA
- Adicionar suporte a reCAPTCHA v2 se necessário

### Se Capsolver não funcionar ❌
- Diagnosticar causa exata (401? Chave inválida? Tipo de CAPTCHA?)
- Explorar soluções alternativas
- Possível ajuste de estratégia

---

## Dúvidas Comuns

**P: Minha chave tem 35 caracteres, é válido?**
R: Não. Capsolver exige **EXATAMENTE 40**. Pode ser chave de outro serviço.

**P: Onde encontro meu saldo no Capsolver?**
R: https://www.capsolver.com/dashboard/account

**P: A chave está em múltiplos lugares, qual usar?**
R: Use a que vem de `data-sitekey` ou iframe `src="...k=..."`. Se houver multiple, todas devem ser iguais.

**P: E se CNA usar reCAPTCHA v2?**
R: Diferentes tipo de chave (diferente tamanho). Vou adicionar suporte.

---

## Próxima Etapa

Assim que testar com a chave real, me avise do resultado:
- ✅ Capsolver funcionando
- ❌ Erro específico

Com isso em mão, implemento as melhorias finais! 🚀
