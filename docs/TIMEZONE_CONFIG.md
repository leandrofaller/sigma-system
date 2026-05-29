# ⏰ Configuração de Timezone - Porto Velho (UTC-4)

## O que foi alterado?

Adicionada a variável de ambiente `TZ=America/Porto_Velho` em:
- ✅ Serviço `app` (aplicação Next.js)
- ✅ Serviço `db` (PostgreSQL)

**Arquivo:** `docker-compose.yml`

```yaml
app:
  environment:
    - TZ=America/Porto_Velho  # ← ADICIONADO
    - DATABASE_URL=...
    
db:
  environment:
    - TZ=America/Porto_Velho  # ← ADICIONADO
    - POSTGRES_USER=...
```

## Por que ambos?

| Serviço | Motivo |
|---------|--------|
| **app (Next.js)** | Timestamps de logs, cron jobs, scraping |
| **db (PostgreSQL)** | Funções `NOW()`, `CURRENT_TIMESTAMP`, timestamps de database |

## Como aplicar?

### 1️⃣ **Se está usando Docker local** (desenvolvimento)

```bash
# Para o container antigo
docker-compose down

# Reconstruir com nova configuração
docker-compose up -d --build

# Verificar se está rodando
docker-compose ps
```

### 2️⃣ **Se está usando Coolify** (produção)

1. Acesse o painel do Coolify
2. Vá para **Configuration** da aplicação "sigma-system"
3. Procure por **Environment Variables**
4. Adicione a variável: `TZ=America/Porto_Velho`
5. Clique em **Deploy**

Ou via CLI/webhook:
```bash
# Trigger redeploy no Coolify
curl -X POST \
  "https://seu-coolify.com/api/deploy" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"service":"sigma-system"}'
```

## Verificar se está funcionando

### ✅ Verificar timezone da aplicação

```bash
# Ver logs mostrando timestamp correto
docker-compose logs app

# Ou em produção:
docker logs sigma_app | tail -20
```

Deve mostrar timestamps como:
```
2026-05-29 04:03:27 ← UTC-4 (Porto Velho)
```

### ✅ Verificar timezone do PostgreSQL

```bash
# Conectar ao banco
docker-compose exec db psql -U sigma_user -d sigma_db

# Dentro do psql:
SELECT NOW();
SHOW timezone;
```

Resultado esperado:
```
             now              
-------------------------------
 2026-05-29 04:03:27.12345-04

timezone  
----------
 America/Porto_Velho
```

### ✅ Verificar em produção

```sql
-- Se puder acessar o banco de produção:
SELECT 
  NOW() as horario_atual,
  timezone as timezone_configurado,
  current_setting('timezone') as timezone_setting
FROM pg_settings 
WHERE name = 'timezone';
```

## Efeitos práticos

Após aplicar:
- ✅ Logs mostram horário correto (UTC-4)
- ✅ Scraping `ultimaSyncAt` registra horário correto
- ✅ Jobs agendados executam no horário certo
- ✅ Relatórios mostram datas/horas corretas
- ✅ Database `createdAt`, `updatedAt` estão em Porto Velho

## Fuso horário: America/Porto_Velho

| Informação | Valor |
|-----------|-------|
| **Nome** | America/Porto_Velho |
| **UTC Offset** | UTC-4 (o ano todo) |
| **Horário de Verão** | Não aplica |
| **Tipo** | Standard (não muda) |
| **Região** | Porto Velho, RO, Brasil |

Porto Velho está sempre em UTC-4 (não segue horário de verão como São Paulo).

## Rollback (se precisar reverter)

Se precisar voltar à configuração anterior:

```bash
# Remover as linhas TZ dos serviços no docker-compose.yml
# Depois:
docker-compose down
docker-compose up -d --build
```

## Checklist Final

Após aplicar as mudanças:

- [ ] Docker containers foram reconstruídos
- [ ] Aplicação iniciou corretamente (`docker-compose ps` mostra UP)
- [ ] Logs mostram timestamps em UTC-4
- [ ] Banco de dados está em America/Porto_Velho
- [ ] Scraping de apenados registra hora correta
- [ ] Relatórios mostram data/hora de Porto Velho

---

**Dúvidas?** Verifique com:
```bash
# Ver todas as variáveis de ambiente no container
docker-compose exec app env | grep TZ

# Ver todas no PostgreSQL
docker-compose exec db psql -U sigma_user -d sigma_db -c "SHOW ALL;" | grep timezone
```
