# 📢 Sistema de Avisos de Manutenção

**Data**: 2026-06-02  
**Status**: ✅ Implementado e pronto  
**Commit**: `bb21618`  
**Branch**: `feature/sistema-aviso-manutencao`

---

## 🎯 Funcionalidade

Sistema para administradores notificarem usuários sobre manutenção do sistema com:
- ✅ Mensagens customizáveis
- ✅ Countdown timer até a manutenção
- ✅ 3 níveis de severidade (INFO, WARNING, CRITICAL)
- ✅ Efeitos visuais relevantes
- ✅ Exibição no topo de todas as páginas
- ✅ Exclusivo para SUPER_ADMIN

---

## 📐 Arquitetura

```
┌─────────────────────────────────────┐
│  MaintenanceAlert (Componente)      │
│  - Exibe no topo de todas páginas   │
│  - Countdown automático             │
│  - Dismissável                      │
└──────────────┬──────────────────────┘
               │
               ├─→ GET /api/system/maintenance (público)
               │   └─→ Retorna aviso ativo
               │
               └─→ GET /api/system/maintenance?all (admin)
                   └─→ Retorna todos os avisos

┌─────────────────────────────────────┐
│  Página Admin: /admin/manutencao    │
│  - Criar avisos                     │
│  - Editar avisos                    │
│  - Ativar/desativar                 │
│  - Deletar avisos                   │
└──────────────┬──────────────────────┘
               │
               ├─→ POST /api/system/maintenance
               ├─→ PUT /api/system/maintenance/:id
               └─→ DELETE /api/system/maintenance/:id
```

---

## 🛠️ Componentes Criados

### 1. **MaintenanceAlert.tsx** (Componente Global)
```
📍 Localização: src/components/MaintenanceAlert.tsx
🎯 Uso: Adicionado em src/app/layout.tsx (exibe em todas páginas)
⚙️ Funcionamento:
   - Fetch /api/system/maintenance a cada 30s
   - Exibe aviso se status = ACTIVE
   - Countdown timer se graceTimeUntil existe
   - Animação pulsante para chamar atenção
   - Fechável (volta ao recarregar página)
```

### 2. **API Endpoints** (Backend)
```
📍 Localização: src/app/api/system/maintenance/

GET /api/system/maintenance
  ├─ Sem auth: retorna aviso ativo apenas
  └─ Com ?all + SUPER_ADMIN: retorna todos

POST /api/system/maintenance (SUPER_ADMIN)
  ├─ Cria novo aviso
  └─ Status: DRAFT por padrão

PUT /api/system/maintenance/:id (SUPER_ADMIN)
  ├─ Edita aviso existente
  └─ Pode mudar status (ACTIVE, DRAFT, ARCHIVED)

DELETE /api/system/maintenance/:id (SUPER_ADMIN)
  └─ Deleta aviso
```

### 3. **Página Admin** (Interface)
```
📍 Localização: src/app/(dashboard)/admin/manutencao/
  ├─ page.tsx (Server Component - autenticação)
  └─ client.tsx (Client Component - interações)

🎯 Funcionalidades:
  ✅ Listar todos os avisos
  ✅ Criar novo aviso
  ✅ Editar aviso existente
  ✅ Ativar/desativar aviso
  ✅ Deletar aviso
  ✅ Exibir aviso ativo destacado
  ✅ Mostrar countdown se houver grace time
```

### 4. **Modelo de Dados** (Prisma)
```
model SystemMaintenance {
  id               String                 @id @default(cuid())
  title            String
  message          String                 @db.Text
  status           MaintenanceStatus      @default(DRAFT)
  severity         MaintenanceSeverity    @default(WARNING)
  graceTimeUntil   DateTime?              // Countdown até manutenção
  createdBy        String
  createdByUser    User                   @relation(...)
  createdAt        DateTime               @default(now())
  updatedAt        DateTime               @updatedAt
}

enum MaintenanceStatus {
  DRAFT      // Rascunho
  ACTIVE     // Visível para usuários
  ARCHIVED   // Histórico
}

enum MaintenanceSeverity {
  INFO       // 🔵 Informação
  WARNING    // 🟡 Aviso
  CRITICAL   // 🔴 Crítico
}
```

---

## 🎨 Efeitos Visuais

| Severidade | Cor | Ícone | Animação |
|-----------|-----|-------|----------|
| **INFO** | Azul | ℹ️ | Pulsante suave |
| **WARNING** | Amarelo | ⚠️ | Pulsante médio |
| **CRITICAL** | Vermelho | 🚨 | Pulsante forte + barra |

```
INFO:
┌────────────────────────────────────┐
│ ℹ️ Título | [Contar]               │
│ Mensagem aqui...                   │
└────────────────────────────────────┘

CRITICAL:
┌────────────────────────────────────┐
│ 🚨 Título | [Contar]               │
│ Mensagem aqui...                   │
│ ⏱️ Tempo: XX horas XX minutos      │
└────────────────────────────────────┘
█████████████████████████████████████ (animado)
```

---

## 🔒 Segurança

✅ **Autenticação**:
- Página admin requer `role === SUPER_ADMIN`
- Redirecionamento automático se não autorizado
- APIs verificam role em POST/PUT/DELETE

✅ **Validação**:
- Título e mensagem obrigatórios
- GraceTime deve ser DateTime válido
- Status/severity valores pré-definidos

✅ **Auditoria**:
- `createdBy` rastreia quem criou
- `createdAt`/`updatedAt` timestamps automáticos
- Logs em console.error/log

---

## 📋 Como Usar

### Para Administrador

**1. Acessar página:**
```
https://seu-site/admin/manutencao
```

**2. Criar novo aviso:**
- Clicar "Novo Aviso"
- Preencher:
  - Título: "Manutenção do Sistema"
  - Mensagem: "Sistema em manutenção..."
  - Severidade: ⚠️ Aviso ou 🚨 Crítico
  - Grace Time (opcional): Data/hora de fim

**3. Ativar aviso:**
- Clicar botão ✅ (verde) ao lado do aviso
- Aviso aparece em topo de todas as páginas

**4. Usuários veem:**
```
┌────────────────────────────────────┐
│ ⚠️ Manutenção do Sistema           │
│ O sistema estará indisponível...   │
│ ⏱️ 5h 23m 45s até manutenção      │ ← Atualiza a cada segundo
│                                  [X]
└────────────────────────────────────┘
```

### Para Usuários

- ✅ Veem aviso em topo da página
- ✅ Veem countdown ao vivo
- ✅ Podem fechar aviso (volta ao recarregar)
- ✅ Não prejudica funcionalidade do sistema

---

## 🧪 Testes

### ✅ Build
```bash
npm run build
# ✓ Sucesso sem erros
# ✓ Componentes compilados
# ✓ APIs funcionais
```

### ✅ Funcionalidade
Para testar:

1. **Criar aviso:**
```bash
curl -X POST http://localhost:3000/api/system/maintenance \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Teste",
    "message": "Aviso de teste",
    "severity": "WARNING",
    "graceTimeUntil": "2026-06-02T15:00:00Z"
  }'
```

2. **Ver aviso (público):**
```bash
curl http://localhost:3000/api/system/maintenance
# → { "maintenance": { ... } }
```

3. **Ver todos (admin):**
```bash
curl "http://localhost:3000/api/system/maintenance?all=true"
# → { "maintenance": [...] }
```

4. **Página admin:**
```
Visitar: http://localhost:3000/admin/manutencao
(requer login com SUPER_ADMIN)
```

---

## ⚡ Integração

Já integrado em:
- ✅ `src/app/layout.tsx` - MaintenanceAlert no topo
- ✅ `prisma/schema.prisma` - Modelo e enums
- ✅ Banco de dados sincronizado

---

## 📝 Notas Técnicas

### Estado Global
- Não usa Redux/Context
- Fetch simples a cada 30s
- Dismissível localmente (sem persistência)

### Performance
- MaintenanceAlert é "use client" leve
- Fetch otimizado com intervalo
- Sem impacto em outras funcionalidades

### Accessibility
- Ícones + cores (não apenas cores)
- Texto descritivo
- Botão X para fechar com aria-label

---

## 🚀 Próximas Melhorias (Opcionais)

- [ ] Notificações via email antes da manutenção
- [ ] Agendamento de manutenção automática
- [ ] Modo de "site em manutenção" (bloqueia acesso)
- [ ] Webhook para alertar ferramentas externas
- [ ] Histórico de manutenções realizadas

---

## 📞 Suporte

**Erro ao criar aviso?**
- Verifique: role === SUPER_ADMIN
- Verifique: título e mensagem não vazios
- Verifique: graceTimeUntil é data válida se fornecido

**Aviso não aparece?**
- Verifique: status = ACTIVE
- Recarregue página (MaintenanceAlert fetch a cada 30s)
- Verifique console para erros de fetch

**Precisa remover aviso?**
- Ativar estado ARCHIVED ou deletar
- Aviso some automaticamente do topo

---

**Status Final**: ✅ Pronto para produção  
**Últimas Mudanças**: 2026-06-02  
**Responsável**: Claude + User
