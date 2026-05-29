# 🔧 Guia Completo: Debug de Facções do SIPE

## 🚨 Problema Atual

```
Error: Não foi possível carregar a lista de facções em nenhum dos primeiros 5 apenados da lista.
Erro original: Nenhum select de facção encontrado (todos rejeitados ou não encontrados)
```

**O que significa:** O script tentou acessar a página de facção de 5 apenados diferentes, mas em nenhum conseguiu encontrar um select válido com nomes de facções.

---

## 🎯 Solução: 3 Passos

### ✅ Passo 1: Verificar Status em Tempo Real

Agora há um novo endpoint SSE para ver os logs em tempo real:

```bash
# Terminal 1: Iniciar sincronização
curl -X POST http://localhost:3000/api/sipe/sync \
  -H "Content-Type: application/json" \
  -d '{"tipo": "FACCOES"}'

# Resposta:
# { "jobId": "abc123def456", "status": "RUNNING" }

# Terminal 2: Acompanhar em tempo real
curl -N http://localhost:3000/api/sipe/sync/stream?jobId=abc123def456
```

**Você verá:**
```
data: {"type":"job-status","status":"RUNNING","fase":"Iniciando scrape..."}
data: {"type":"log","message":"[FACCOES] 🔍 Iniciando scrape de facções..."}
data: {"type":"log","message":"[FACCOES] 📄 Tentativa 1/5..."}
data: {"type":"error","message":"Nenhum select de facção encontrado..."}
data: {"type":"done","status":"FAILED"}
```

### ✅ Passo 2: Debugar a Página Real

Execute o script de debug avançado:

```bash
SIPE_USER=seu_usuario SIPE_PASSWORD=sua_senha \
  npx tsx src/lib/debug-faccoes-advanced.ts
```

**Vai gerar 2 arquivos no diretório `.debug-sipe/`:**

1. **`faccao-page.html`** — HTML completo da página (abra no navegador)
2. **`analysis.json`** — Análise estruturada

**Saída no terminal:**
```
📋 Total de SELECTs: 3

[0] sexo (2 opções)
    Opções: Masculino | Feminino
    ⚠️ AVISO: Este é SELECT DE GÊNERO!

[1] faccao (5 opções)
    Opções: CV | PCC | TCP | ...
    ✅ VALIDADO: Não é gênero

[2] situacao (3 opções)
    Opções: Recolhido | Liberado | ...
```

**Recomendação:**
```
✅ USAR ESTE SELETOR:
   select[name="faccao"]
   Contém: CV | PCC | TCP | ...
```

### ✅ Passo 3: Ajustar o Código

Com a informação do debug, ajuste `src/lib/sipe-scraper.ts`:

**Se o seletor encontrado foi `select[name="faccao"]`:**

```typescript
const selectors = [
  'select[name="faccao"]',      // ← ADICIONAR AQUI (do debug)
  'select[name="faccao_id"]',
  'select[name*="faccao"]',
  'select[id*="faccao"]',
  'select'
]
```

---

## 📋 Por Que Falha?

### Cenário 1: Nome do Select é Diferente

**SIPE usa:**
```html
<select name="faccao">     <!-- NÃO "faccao_id"! -->
  <option>CV</option>
  <option>PCC</option>
</select>
```

**Código procura:**
```typescript
'select[name="faccao_id"]'  // ❌ Não encontra!
'select[name*="faccao"]'     // ✅ Encontra este
```

### Cenário 2: Apenado Não Tem Acesso

Alguns apenados podem não ter permissão para editar facção. Solução: **tentar próximos apenados** (já faz isso).

### Cenário 3: Página Estrutura Diferente

Cada versão do SIPE pode ter estrutura HTML diferente. Solução: **usar debug script** para entender a estrutura real.

---

## 🛠️ Como Usar o Debug Script

### Preparar Credenciais

```bash
# Arquivo .env
SIPE_USER=seu_usuario_sipe
SIPE_PASSWORD=sua_senha_sipe
```

Ou passar via comando:

```bash
SIPE_USER=usuario SIPE_PASSWORD=senha npx tsx src/lib/debug-faccoes-advanced.ts
```

### Executar Script

```bash
cd F:\relatorio_claude

# Com npm
npm run build
npx tsx src/lib/debug-faccoes-advanced.ts

# Ou direto com tsx
npx tsx src/lib/debug-faccoes-advanced.ts
```

### Analisar Resultado

#### ✅ Se viu facções reais:
```
[1] faccao (5 opções)
    Opções: CV | PCC | TCP | ...
    ✅ VALIDADO: Não é gênero
```

**Ação:** Usar o seletor recomendado

#### ❌ Se só viu gênero:
```
[0] sexo (2 opções)
    Opções: Masculino | Feminino
    ⚠️ AVISO: Este é SELECT DE GÊNERO!

❌ PROBLEMA: Nenhum seletor de facção válido foi encontrado!
```

**Ações:**
1. Tentar página `/editar` em vez de `/faccao`
2. Testar com outro apenado (ID diferente)
3. Verificar se credenciais têm permissão

---

## 📖 Entender o Analysis.json

```json
{
  "selects": [
    {
      "index": 0,
      "name": "sexo",
      "optionsCount": 2,
      "optionsText": "Masculino | Feminino",
      "isVisible": true
    },
    {
      "index": 1,
      "name": "faccao",
      "optionsCount": 5,
      "optionsText": "CV | PCC | TCP | GCC | PCC_Dissidência",
      "isVisible": true
    }
  ],
  "inputs": [
    {
      "type": "hidden",
      "name": "faccao_id",
      "value": "0"
    }
  ]
}
```

**Chaves importantes:**
- `name` — nome do select (usar em seletor CSS)
- `optionsCount` — quantidade de opções (facção deve ter > 5)
- `optionsText` — primeiras opções (não deve ter "Masculino"/"Feminino")

---

## 🔍 Arquivo HTML

Abra `.debug-sipe/faccao-page.html` no navegador para:
1. ✅ Ver a página exatamente como o script vê
2. ✅ Clicar em selects para confirmar quais são facção
3. ✅ Inspecionar com DevTools (F12) para entender a estrutura

---

## 📊 Checklist de Debug

- [ ] Executou `debug-faccoes-advanced.ts`?
- [ ] Acessou `.debug-faccoes/faccao-page.html` no navegador?
- [ ] Leu `analysis.json` para entender a estrutura?
- [ ] Identificou qual seletor contém facções reais?
- [ ] Adicionou esse seletor ao array `selectors` em `sipe-scraper.ts`?
- [ ] Fez git commit com a mudança?
- [ ] Executou `POST /api/sipe/sync` novamente?
- [ ] Acompanhou com `GET /api/sipe/sync/stream?jobId=...`?

---

## 🎯 Fluxo Completo de Resolução

```
1. EXECUTAR DEBUG
   └─ npm run debug-faccoes-advanced.ts

2. ANALISAR RESULTADO
   ├─ Abrir .debug-sipe/faccao-page.html
   ├─ Ler .debug-sipe/analysis.json
   └─ Identificar seletor de facção

3. ATUALIZAR CÓDIGO
   ├─ Editar src/lib/sipe-scraper.ts
   ├─ Adicionar seletor encontrado ao array
   └─ git commit

4. TESTAR
   ├─ POST /api/sipe/sync {"tipo": "FACCOES"}
   ├─ Pegar jobId da resposta
   ├─ Acompanhar: GET /api/sipe/sync/stream?jobId=...
   └─ Verificar se completou com sucesso

5. VALIDAR
   └─ GET /api/sipe/faccoes (deve mostrar facções reais)
```

---

## 🚀 Exemplo: Após Resolver

**Antes (erro):**
```
Error: Não foi possível carregar a lista de facções
```

**Depois (sucesso):**
```
[FACCOES] 📊 Facções encontradas: 5
[FACCOES] 📋 Primeiras: CV, PCC, TCP, GCC, PCC_Dissidência
[FACCOES] ✅ Sucesso na tentativa 1!
[FACCOES] 💾 Salvando 5 facções no banco...
[FACCOES] ✅ 5 facções salvas com sucesso
```

---

## 💬 Possíveis Seletores Encontrados

Dependendo da versão do SIPE, o script pode encontrar:

```typescript
// Opção 1: Nome exato
'select[name="faccao"]'

// Opção 2: Nome com sufixo
'select[name="faccao_id"]'

// Opção 3: ID
'select#faccao'
'select[id*="faccao"]'

// Opção 4: Posição (menos confiável)
'form select:nth-of-type(2)'
```

**Adicionar o encontrado ao array em `sipe-scraper.ts`:**

```typescript
const selectors = [
  'select[name="faccao"]',      // ← SE ENCONTROU ISTO
  'select[name="faccao_id"]',   // Manter os originais
  'select[name*="faccao"]',     //
  'select[id*="faccao"]',       //
  'select'                      // Último recurso
]
```

---

## ❓ FAQ

**P: O script fica travado?**  
R: Usa timeout de 20s na página /faccao. Se não carregar, é problema de conexão/SIPE.

**P: Qual apenado usar para debug?**  
R: O script testa os primeiros 5. Se nenhum funciona, tente manualmente com IDs diferentes.

**P: E se a página /editar tem estrutura diferente?**  
R: O script já testa ambas. `/faccao` é tentada primeiro.

**P: Como saber se é problema de permissões?**  
R: Se alguns apenados funcionam e outros não, é permissão.

---

## 📞 Próximas Ações

1. ✅ Executar script de debug
2. ✅ Enviar arquivo `analysis.json` (se precisar de ajuda)
3. ✅ Atualizar código com seletor encontrado
4. ✅ Testar sincronização novamente

**Pronto para começar!** 🚀
