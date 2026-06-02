# 📋 Análise: Scraping Global - Respeitar Nomenclatura de Unidades

## 🎯 Objetivo
Modificar o tipo de sincronização `GLOBAL` para que, ao invés de renomear todos os apenados para "Todas as Unidades (Global)", respeite a nomenclatura original da unidade de cada apenado. Caso não esteja vinculado a nenhuma unidade, usar a **Situação** do apenado.

---

## 📍 Problema Atual

**Arquivo**: `src/app/api/sipe/sync/route.ts` (linha 185-199)

```typescript
// ── Global sync (todas as unidades via /apenados/index) ──
if (tipo === 'GLOBAL') {
  const job = await prisma.sipeSyncJob.create({
    data: {
      tipo: 'GLOBAL',
      unidade: 'GLOBAL',
      unidadeNome: 'Todas as Unidades (Global)',  // ❌ HARDCODEADO
      status: 'RUNNING',
      iniciadoEm: new Date(),
      criadoPor: session.user.id,
    },
  })

  startSipeSync(jobId, 'GLOBAL')
  return NextResponse.json({ jobId: job.id, status: 'RUNNING' })
}
```

**Consequência**: Todos os apenados scrapeados recebem `unidadeNome: 'Todas as Unidades (Global)'`, perdendo a referência à sua unidade original.

---

## 🔍 Fluxo de Dados Atual

```
POST /api/sipe/sync (tipo: 'GLOBAL')
      ↓
Cria SipeSyncJob com unidadeNome = 'Todas as Unidades (Global)'
      ↓
startSipeSync(jobId, 'GLOBAL')
      ↓
runScrape() → coletarIdsApenados(page, 'GLOBAL', jobId, null, true)
      ↓
scrapeApenadoFicha(page, sipeId, job.unidadeNome, useSearch)
      ↓
Todos apenados scrapeados recebem unidade: 'Todas as Unidades (Global)'
```

---

## 💾 Dados Disponíveis no Banco

**Modelo**: `SipeApenadoImportado` (prisma/schema.prisma, linha 539-574)

Cada apenado importado possui:
```typescript
unidade?: string      // Ex: '3', '1', '5', etc.
situacao?: string     // Ex: 'Em Liberdade', 'Livramento Condicional', 'Fuga', etc.
```

**Mapeamento de Unidades** (já existe em `route.ts`, linha 11-22):
```typescript
const UNIDADES: Record<string, string> = {
  '3': 'CDPPVH - Centro de Detenção Provisório de Porto Velho',
  '1': 'PANDA - Penitenciária Edvan Mariano Rosendo',
  '5': 'Penitenciária Estadual Suely Maria Mendonça',
  '6': 'UPES - Unidade Provisória de Segurança Especial',
  '9': 'CAPEP I - Colônia Agrícola Penal Ênio Pinheiro',
  '16': 'PEA - Penitenciária Estadual Aruana',
  '17': 'Penitenciária Milton Soares de Carvalho',
  '91': 'Penitenciária Jorge Thiago Aguiar Afonso',
  '12': 'CRVG - Centro de Ressocialização Vale do Guaporé',
  '25': 'Centro de Ressocialização Jonas Ferreti',
}
```

---

## 🔧 Solução Proposta

### **Estratégia: Dinâmica com Post-Processing**

Em vez de atribuir o `unidadeNome` no início, vamos:

1. **Fase 1**: Criar o SipeSyncJob com um placeholder (`unidadeNome: null`)
2. **Fase 2**: Após scraping de cada apenado, atualizar o **banco de dados** com a unidade/situação REAL
3. **Fase 3**: O SyncPanel exibe a unidade correta que está no banco

### **Código Principal: `scrapeApenadoFicha()`**

**Arquivo**: `src/lib/sipe-scraper.ts` (função `scrapeApenadoFicha`)

Após salvar os dados do apenado em `SipeApenadoImportado`, adicionar:

```typescript
// ✅ Determinador dinâmico de unidade baseado em dados reais
function determinarNomeUnidade(
  unidade: string | undefined,
  situacao: string | undefined
): string {
  // 1️⃣ Se tem unidade, usar mapeamento
  if (unidade) {
    const UNIDADES_MAP: Record<string, string> = {
      '3': 'CDPPVH - Centro de Detenção Provisório de Porto Velho',
      '1': 'PANDA - Penitenciária Edvan Mariano Rosendo',
      '5': 'Penitenciária Estadual Suely Maria Mendonça',
      '6': 'UPES - Unidade Provisória de Segurança Especial',
      '9': 'CAPEP I - Colônia Agrícola Penal Ênio Pinheiro',
      '16': 'PEA - Penitenciária Estadual Aruana',
      '17': 'Penitenciária Milton Soares de Carvalho',
      '91': 'Penitenciária Jorge Thiago Aguiar Afonso',
      '12': 'CRVG - Centro de Ressocialização Vale do Guaporé',
      '25': 'Centro de Ressocialização Jonas Ferreti',
    }
    return UNIDADES_MAP[unidade] || `Unidade ${unidade}`
  }

  // 2️⃣ Senão, usar situação (ou fallback)
  if (situacao) {
    return situacao
  }

  // 3️⃣ Fallback final (não deveria chegar aqui)
  return 'Sem Informação'
}
```

### **Impactos Mínimos**

1. **route.ts**: Apenas 3 linhas mudadas
   - Remover hardcode de `unidadeNome`
   - Deixar null para ser determinado dinamicamente

2. **sipe-scraper.ts**: Adicionar função `determinarNomeUnidade()` + 1 chamada por apenado scrapeado

3. **SyncPanel.tsx**: ZERO mudanças (exibe `job.unidadeNome` que virá do banco)

---

## 📊 Matriz de Casos de Uso

| Cenário | `unidade` | `situacao` | Resultado |
|---------|-----------|-----------|-----------|
| Apenado em prisão | `'3'` | - | `'CDPPVH - Centro de Detenção...'` |
| Apenado em liberdade | `null` | `'Em Liberdade'` | `'Em Liberdade'` |
| Fuga | `null` | `'Fuga'` | `'Fuga'` |
| Livramento condicional | `null` | `'Livramento Condicional'` | `'Livramento Condicional'` |
| Dado corrompido | `null` | `null` | `'Sem Informação'` |

---

## ⚠️ Riscos e Mitigação

| Risco | Mitigação | Viável |
|-------|-----------|--------|
| Quebra SyncPanel | Zero mudanças nele | ✅ Alto |
| Quebra banco | Só lê `unidade` e `situacao` (já existem) | ✅ Alto |
| Performance | 1 lookup de dict por apenado (~0.1ms) | ✅ Alto |
| Mapeamento incompleto | Fallback para `Unidade {id}` e `{situacao}` | ✅ Alto |
| Histórico de jobs | Será atualizado após próxima execução | ✅ Aceitável |

---

## 🛠️ Arquivos a Modificar

### 1. **src/app/api/sipe/sync/route.ts**
   - **Linhas 184-199**: Remover hardcode, deixar null
   - **Linha 11-22**: Manter UNIDADES (reusada em sipe-scraper.ts)

### 2. **src/lib/sipe-scraper.ts**
   - **Nova função**: `determinarNomeUnidade()`
   - **Na função `scrapeApenadoFicha()`**: Chamar após salvar dados
   - **No final da Phase 2**: Atualizar SipeSyncJob com unidades coletadas

### 3. **SyncPanel.tsx**
   - **Nenhuma mudança** ✅

---

## 🧪 Testes Sugeridos

1. **Scraping GLOBAL com apenados em diferentes situações**
   - Verificar que cada um recebe sua unidade/situação correta

2. **Histórico de jobs**
   - Confirmar que jobs antigos não quebram
   - Novos jobs mostram dados dinâmicos

3. **Edge cases**
   - Apenado sem unidade E sem situação → `'Sem Informação'`
   - Unidade desconhecida → `'Unidade {id}'`

---

## 💡 Próximos Passos Recomendados

1. **Fase 0 (Hoje)**: Aprovação desta análise
2. **Fase 1 (1-2h)**: Implementar mudanças de código
3. **Fase 2 (30min)**: Testar localmente com Scraping GLOBAL
4. **Fase 3 (5min)**: Fazer commit e push

**Tempo Total Estimado**: 2-3 horas (muito seguro, baixo risco)

---

## ✅ Conclusão

A solução é **viável, segura e de baixo risco** porque:

1. ✅ Reutiliza dados que já estão no banco (`unidade`, `situacao`)
2. ✅ Não modifica schema do banco
3. ✅ Não quebra nenhum componente existente
4. ✅ Tem fallbacks robustos
5. ✅ Impacto: apenas 2 arquivos, ~50 linhas de código

**Recomendação**: Implementar imediatamente. ✨
