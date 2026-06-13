# 📋 Histórico de Sincronizações - Guia de Uso

## Melhorias Implementadas

### ✅ Aumento de Registros
- **Antes**: Limitado a 20 registros
- **Depois**: Aumentado para 100 registros
- **Benefício**: Não perderá sincronizações pausadas ou antigas

### ✅ Exclusão Individual
- **Novo**: Deletar registros específicos por ID
- **Proteção**: Não permite deletar jobs em execução (RUNNING/PENDING)
- **Flexibilidade**: Também mantém opção de deletar todos de uma vez

---

## 🔍 Como Usar

### Visualizar Histórico (até 100 registros)
```bash
# Via API
curl -X GET http://localhost:3000/api/sipe/sync \
  -H "Authorization: Bearer <token>"

# Automático no dashboard
# Dashboard mostra os últimos 100 registros de sincronização
```

### Deletar Registro Específico
```bash
# Deleta um único job por ID
curl -X DELETE "http://localhost:3000/api/sipe/sync/history?id=<jobId>" \
  -H "Authorization: Bearer <token>"

# Resposta:
# {
#   "deletado": true,
#   "jobId": "cmpsn...",
#   "status": "COMPLETED",
#   "message": "Job cmpsn... deletado com sucesso"
# }
```

### Deletar Todos os Finalizados
```bash
# Deleta todos os registros que NÃO estão em execução
curl -X DELETE "http://localhost:3000/api/sipe/sync/history" \
  -H "Authorization: Bearer <token>"

# Resposta:
# {
#   "deletados": 45,
#   "message": "45 registros finalizados deletados"
# }
```

---

## 📊 Histórico de Sincronizações

### Status Possíveis
- 🟢 **RUNNING** - Sincronização em andamento
- 🟡 **PENDING** - Aguardando início
- 🟢 **COMPLETED** - Concluída com sucesso
- 🔴 **FAILED** - Falhou
- 🟠 **INTERRUPTED** - Pausada pelo usuário

### Campos Exibidos
- **ID**: Identificador único do job
- **Tipo**: APENADOS, ADVOGADOS, FACCOES, UNIDADES
- **Status**: Estado atual
- **Unidade**: Qual unidade prisional foi sincronizada
- **Total**: Quantidade de registros
- **Processado**: Quantidade já processada
- **Erros**: Quantidade de erros encontrados
- **Iniciado em**: Data/hora de início
- **Finalizado em**: Data/hora de conclusão
- **Última atividade**: Último movimento registrado

---

## 🛡️ Proteções

### Jobs em Execução
- ✅ NEVER podem ser deletados individualmente
- ✅ NEVER aparecem no "deletar todos"
- ✅ Protegidos contra acidentes

### Jobs Pausados
- ✅ Podem ser resumidos
- ✅ Agora aparecem em 100 registros (não desaparecem)
- ✅ Podem ser deletados se mudar de ideia

### Acesso
- ✅ Apenas SUPER_ADMIN pode acessar
- ✅ Requer autenticação válida
- ✅ Logs auditados

---

## 📈 Exemplo de Resposta

### GET /api/sipe/sync (Listar até 100)
```json
[
  {
    "id": "cmpsn6qv4000013284ycmmsgc",
    "status": "COMPLETED",
    "tipo": "APENADOS",
    "unidade": "3",
    "unidadeNome": "CDPPVH - Centro de Detenção Provisório de Porto Velho",
    "total": 2339,
    "processado": 2339,
    "erros": 0,
    "fase": "Coleta de dados concluída",
    "iniciadoEm": "2026-05-30T14:00:00Z",
    "finalizadoEm": "2026-05-30T14:45:18Z",
    "ultimaAtividade": "2026-05-30T14:45:18Z",
    "createdAt": "2026-05-30T14:00:00Z"
  },
  ...mais 99 registros
]
```

---

## 💡 Caso de Uso: Sincronização Pausada

### Antes (Problema)
```
1. Inicia sincronização de APENADOS
2. Pausa após processar 500 registros
3. Sai do sistema
4. Volta após 2 horas
5. ❌ Registro desapareceu (limite de 20)
6. Não consegue retomar
```

### Depois (Solução)
```
1. Inicia sincronização de APENADOS
2. Pausa após processar 500 registros
3. Sai do sistema
4. Volta após 2 horas
5. ✅ Registro ainda está lá (limite de 100)
6. ✅ Clica em "Retomar Sincronização"
7. ✅ Continua do ponto 500
```

---

## 🗑️ Limpeza de Histórico

### Recomendação
- **Manter últimos**: 20-50 registros (últimas 2-3 semanas)
- **Deletar**: Registros com >1 mês
- **Frequência**: Semanal ou mensal

### Limpeza Automática (Futuro)
```
- Deletar automaticamente jobs FAILED/INTERRUPTED após 30 dias
- Manter apenas últimos 100 registros COMPLETED
- Implementável se necessário
```

---

## 📝 Notas Técnicas

### Mudanças no Código
- **route.ts**: `take: 20` → `take: 100`
- **history/route.ts**: Adicionado suporte a `?id=<jobId>` para delete individual

### Compatibilidade
- ✅ Retrocompatível com código existente
- ✅ Não afeta jobs em execução
- ✅ Dashboard automático se atualiza

---

## ✅ Checklist de Uso

- [ ] Visualizar histórico (até 100 registros)
- [ ] Retomar sincronização pausada (agora visível)
- [ ] Deletar um registro específico (por ID)
- [ ] Deletar todos os finalizados (uma vez)
- [ ] Verificar logs de jobs finalizados
- [ ] Planejar limpeza mensal de histórico
