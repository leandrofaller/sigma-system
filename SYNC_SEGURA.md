# 🔒 Sincronização CNA Segura - Proteção contra Execuções Simultâneas

## O Problema

Testes anteriores deixavam múltiplos processos de sincronização rodando simultaneamente, causando:
- ❌ Competição por recursos
- ❌ Conflitos de acesso ao BD
- ❌ Bloqueios desnecessários de CAPTCHA
- ❌ Múltiplas instâncias do Playwright

## A Solução: Lock File

Um mecanismo de **lock file** garante que apenas uma sincronização rode por vez.

---

## 📖 Como Usar

### Opção 1: Via Script Seguro (Recomendado)

```bash
# Executa sincronização com proteção de lock
npx tsx scripts/sync-cna-safe.ts
```

### Opção 2: Via Shell Script

```bash
./sync-cna-safe.sh
```

### Opção 3: Direto (Sem Proteção)

```bash
# ⚠️ Não recomendado - pode causar execuções simultâneas
npx tsx scripts/sync-cna-manual.ts
```

---

## 🔍 Como Funciona

### Ao Iniciar:
1. Verifica se arquivo `.sync-lock` existe
2. Se SIM:
   - Se < 1 hora atrás: Rejeita (já rodando)
   - Se > 1 hora atrás: Remove (assume travamento) e continua
3. Se NÃO: Cria lock file e inicia sincronização

### Ao Finalizar:
1. Remove arquivo `.sync-lock`
2. Libera recurso para próxima sincronização

### Se Interrompido (Ctrl+C):
1. Detecta sinal SIGINT/SIGTERM
2. Remove lock file automaticamente
3. Garante que não fica travado

---

## ⚙️ Detalhes Técnicos

### Lock File
- **Localização**: `.sync-lock` (raiz do projeto)
- **Conteúdo**: Timestamp de criação (ms desde 1970)
- **Timeout**: 1 hora (proteção contra travamento)

### Timeout Automático
Se lock existir por > 1 hora, é considerado expirado e removido:
```
Lock age > 60min → Remove automaticamente
```

### Verificação de Status
Para verificar se sincronização está rodando:
```bash
# Se arquivo existe, sincronização está em andamento
ls -lah .sync-lock
```

### Forçar Desbloqueio Manual
```bash
# ⚠️ Use apenas se sincronização travou
rm .sync-lock
```

---

## ✅ Validação

Teste a proteção:
```bash
# Terminal 1: Inicia sincronização
npx tsx scripts/sync-cna-safe.ts

# Terminal 2: Tenta iniciar outra (será rejeitada)
npx tsx scripts/sync-cna-safe.ts
# Saída: ❌ Sincronização já em execução!
```

---

## 📊 Exemplo de Uso

```bash
$ npx tsx scripts/sync-cna-safe.ts

🔒 Lock adquirido. Sincronização iniciada...

============================================================
🚀 Iniciando Sincronização CNA
============================================================

🚀 Iniciando sincronização CNA...
📊 Total de advogados com OAB: 2339
...
[Sincronização em andamento por ~45 minutos]
...

============================================================
✅ Sincronização Concluída
============================================================

🔓 Lock liberado
```

---

## 🛡️ Proteção contra Problemas

| Cenário | Antes | Depois |
|---------|-------|--------|
| 2 execuções simultâneas | ❌ Ambas rodavam | ✅ 2ª é rejeitada |
| Processo travado | ❌ Lock permanente | ✅ Auto-limpa em 1h |
| Ctrl+C do usuário | ❌ Lock ativo | ✅ Auto-limpa |
| Verificar status | ❌ Sem forma | ✅ `ls -lah .sync-lock` |

---

## 🚀 Recomendação

**Use sempre `sync-cna-safe.ts` para garantir segurança!**

```bash
# ✅ RECOMENDADO
npx tsx scripts/sync-cna-safe.ts

# ❌ NÃO RECOMENDADO
npx tsx scripts/sync-cna-manual.ts
```

---

## 📝 Notas

- Lock file é criado/removido automaticamente
- Sem lock file = sincronização permitida
- Arquivo é muito pequeno (~10 bytes)
- Timeout de 1 hora previne travamentos indefinidos
