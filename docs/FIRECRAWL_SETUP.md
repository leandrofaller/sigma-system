# 🔥 Firecrawl Setup & Testing Guide

## Objetivo

Adicionar Firecrawl como engine alternativo ao scraping de "Sincronizar Unidades Prisionais", permitindo **70% de performance** vs Playwright (~1.5h vs 4h).

---

## Setup Firecrawl Self-hosted

### Pré-requisitos
- Docker instalado (`docker --version`)
- Porta 3002 disponível (ou configurar outra em `.env`)

### 1️⃣ Rodar Firecrawl Container

**Opção A: Docker direto (rápido)**
```bash
docker run -p 3002:3002 mendableai/firecrawl:latest
```

**Opção B: Docker Compose (sustentável)**

Criar `docker-compose.firecrawl.yml`:
```yaml
version: '3.8'
services:
  firecrawl:
    image: mendableai/firecrawl:latest
    ports:
      - "3002:3002"
    restart: unless-stopped
```

Rodar:
```bash
docker-compose -f docker-compose.firecrawl.yml up -d
```

### 2️⃣ Verificar Saúde

```bash
curl http://localhost:3002/health
# Resposta esperada: {"status":"ok"} ou similar
```

### 3️⃣ Configurar Variáveis de Ambiente

No `.env` ou `.env.local`:
```env
FIRECRAWL_BASE_URL=http://localhost:3002
```

---

## 🧪 Teste de Performance

### Setup
1. ✅ Firecrawl rodando em `localhost:3002`
2. ✅ Variável `FIRECRAWL_BASE_URL` configurada
3. ✅ Sistema de relatório iniciado

### Passo 1: Teste com Playwright (Baseline)

Na UI do sistema:
1. Ir para **Sincronização** → **Scraping Global**
2. **Não selecionar** Firecrawl (usa Playwright por padrão)
3. Clicar **"Scraping Global (Todas as Unidades)"**
4. Anotar tempo total (hora de início)
5. Aguardar conclusão
6. **Anotar tempo final**

**Exemplo:**
- Início: 14:00
- Fim: 18:00
- **Tempo Playwright: 4 horas**

### Passo 2: Teste com Firecrawl (Novo)

Na UI do sistema:
1. Ir para **Sincronização**
2. **Selecionar "🔥 Firecrawl"** no dropdown
3. Clicar **"Scraping Global (Todas as Unidades)"**
4. Anotar tempo inicial
5. Aguardar conclusão
6. **Anotar tempo final**

**Exemplo:**
- Início: 14:00
- Fim: 15:30
- **Tempo Firecrawl: 1.5 horas (62% mais rápido!)**

### Passo 3: Validar Dados

Após ambos os testes:

```sql
-- Verificar quantos apenados foram coletados em cada teste
SELECT COUNT(*) FROM "sipeApenadoImportado";

-- Comparar dados estrutura (ambos devem ter mesmos campos)
SELECT sipeId, nome, cpf, unidade 
FROM "sipeApenadoImportado" 
LIMIT 10;
```

---

## 📊 Esperado vs Real

### Esperado (Conforme Plano)
| Engine | Tempo | Ganho |
|--------|-------|-------|
| Playwright | 4h | Baseline |
| Firecrawl | 1.5h | **62% mais rápido** |

### Real (Seu teste)
| Engine | Tempo | Ganho |
|--------|-------|-------|
| Playwright | ___ | Baseline |
| Firecrawl | ___ | **___ %** |

---

## 🐛 Troubleshooting

### ❌ "Firecrawl não está disponível"

```
Erro: Firecrawl não está disponível
Details: Verifique se Firecrawl está rodando em http://localhost:3002
```

**Solução:**
```bash
# 1. Verificar se container está rodando
docker ps | grep firecrawl

# 2. Se não está, iniciar
docker run -p 3002:3002 mendableai/firecrawl:latest

# 3. Aguardar ~10-15 segundos para iniciar
# 4. Testar health
curl http://localhost:3002/health
```

### ❌ "Porta 3002 já em uso"

```bash
# Listar o que está usando a porta
lsof -i :3002  # macOS/Linux
netstat -ano | findstr :3002  # Windows

# Usar porta diferente
docker run -p 3001:3002 mendableai/firecrawl:latest

# Atualizar .env
FIRECRAWL_BASE_URL=http://localhost:3001
```

### ❌ Dados incompletos com Firecrawl

Se Firecrawl não conseguir coletar todos os dados:

1. **Verificar logs:**
   ```bash
   docker logs $(docker ps | grep firecrawl | awk '{print $1}')
   ```

2. **SIPE pode estar bloqueando Firecrawl:**
   - Solução: Adicionar user-agent/delay no código de Firecrawl
   - Fallback: Sistema volta para Playwright automaticamente

---

## 📝 Próximos Passos

1. **Rodar Firecrawl** em sua máquina
2. **Testar com Playwright** (baseline)
3. **Testar com Firecrawl** (novo)
4. **Comparar performance** e anotar ganhos reais
5. **Validar dados** (contar apenados, comparar estrutura)
6. **Decidir:** Manter Firecrawl? Volta para Playwright? Usar Cloud API?

---

## 📞 Suporte

Se encontrar problemas:

1. Verificar logs do Firecrawl: `docker logs <container-id>`
2. Testar health endpoint: `curl http://localhost:3002/health`
3. Verificar .env está configurado corretamente
4. Tentar com Playwright como fallback (sempre funciona)

---

## Recursos Úteis

- **Firecrawl Docs:** https://docs.firecrawl.dev/
- **Docker Desktop:** https://www.docker.com/products/docker-desktop
- **Troubleshooting Firecrawl:** https://docs.firecrawl.dev/troubleshooting

