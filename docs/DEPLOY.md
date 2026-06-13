# SIGMA — Guia Completo de Deploy na Hostinger VPS

> **IMPORTANTE:** Toda esta documentação é para uso interno. O sistema tem aparência de empresa de entregas (LogiTrack Express) para o público externo.

---

## PRÉ-REQUISITOS

- VPS Hostinger com Ubuntu 22.04 (recomendado: KVM 2 ou superior — 2 vCPU, 4GB RAM)
- Domínio apontado para o IP da VPS
- Conta no GitHub
- Conta no Google Cloud (para Drive e/ou Gemini) — opcional
- Conta na OpenAI — opcional

---

## PASSO 1 — Preparar a VPS

### 1.1 Acesse a VPS via SSH

```bash
ssh root@SEU_IP_VPS
```

### 1.2 Atualize o sistema

```bash
apt update && apt upgrade -y
apt install -y curl git nano ufw
```

### 1.3 Configure o Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp    # remover depois de configurar o proxy
ufw enable
```

---

## PASSO 2 — Instalar Docker

```bash
curl -fsSL https://get.docker.com | bash
systemctl enable docker
systemctl start docker

# Adicionar usuário ao grupo docker (opcional)
usermod -aG docker $USER
```

Verificar instalação:
```bash
docker --version
docker compose version
```

---

## PASSO 3 — Instalar o Coolify

O Coolify é a plataforma de auto-deploy. Instale com um único comando:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Aguarde a instalação (~5 minutos). Ao finalizar, acesse:
```
http://SEU_IP_VPS:8000
```

### 3.1 Configuração inicial do Coolify

1. Crie o usuário administrador
2. Configure o servidor local (já configurado automaticamente)
3. Vá em **Settings > SSH Keys** e adicione sua chave SSH

---

## PASSO 4 — Configurar o Repositório GitHub

### 4.1 Suba o código para o GitHub

```bash
# Na sua máquina local (dentro da pasta do projeto)
git init
git add .
git commit -m "Initial commit: SIGMA System"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/sigma-system.git
git push -u origin main
```

### 4.2 Gere um Personal Access Token no GitHub

1. GitHub → Settings → Developer Settings → Personal Access Tokens
2. Gere token com permissão: `repo`
3. Salve o token

---

## PASSO 5 — Configurar o Coolify

### 5.1 Adicionar o repositório

1. No Coolify, clique em **+ New Resource**
2. Selecione **Application**
3. Selecione **GitHub** → conecte com seu token
4. Selecione o repositório `sigma-system`
5. Branch: `main`
6. Build Pack: **Dockerfile**

### 5.2 Configurar variáveis de ambiente

No Coolify, vá em **Environment Variables** e adicione:

```env
DATABASE_URL=postgresql://sigma_user:SENHA_FORTE@sigma_db:5432/sigma_db
NEXTAUTH_URL=https://seu-dominio.com
NEXTAUTH_SECRET=GERE_COM_COMANDO_ABAIXO
POSTGRES_PASSWORD=SENHA_FORTE_AQUI
REDIS_PASSWORD=SENHA_REDIS_AQUI
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
```

Para gerar o NEXTAUTH_SECRET:
```bash
openssl rand -base64 32
```

### 5.3 Configurar o Docker Compose

No Coolify, selecione **Docker Compose** como tipo de deploy e cole o conteúdo do arquivo `docker-compose.yml`.

Ou use o **Dockerfile** diretamente se quiser apenas o app (com banco externo).

### 5.4 Configurar domínio

1. Em **Domains**, adicione: `https://seu-dominio.com`
2. Habilite **Let's Encrypt** para HTTPS automático
3. Coolify cuidará do certificado SSL automaticamente

---

## PASSO 6 — Configurar Auto-Deploy

### 6.1 Obter o Webhook do Coolify

1. No Coolify, vá em sua aplicação
2. Clique em **Webhooks**
3. Copie a URL do webhook

### 6.2 Configurar Secrets no GitHub

1. No seu repositório GitHub, vá em **Settings → Secrets and variables → Actions**
2. Adicione:
   - `COOLIFY_WEBHOOK_URL` = URL copiada no passo anterior
   - `COOLIFY_TOKEN` = Token de API do Coolify (Settings → API Tokens)

Agora, **toda vez que você der `git push` na branch `main`**, o Coolify fará o deploy automaticamente!

---

## PASSO 7 — Configurar o Banco de Dados

### 7.1 Primeiro deploy

Após o primeiro deploy, execute as migrações:

```bash
# Acesse o container da aplicação
docker exec -it sigma_app sh

# Execute as migrações
npx prisma db push

# Execute o seed (cria admin inicial)
npx tsx prisma/seed.ts

exit
```

### 7.2 Credenciais iniciais

```
E-mail: admin@sigma.local
Senha: Admin@2024!
```

**MUDE A SENHA IMEDIATAMENTE após o primeiro acesso!**

---

## PASSO 8 — Configurar DNS na Hostinger

### 8.1 No painel Hostinger

1. Vá em **Domínios → DNS / Nameservers**
2. Adicione/edite o registro A:
   - **Tipo:** A
   - **Nome:** @ (domínio raiz) ou subdomínio desejado
   - **Valor:** IP da sua VPS
   - **TTL:** 300

3. Aguarde propagação DNS (5-30 minutos)

---

## PASSO 9 — Configurar Google Drive (Backup — Opcional)

### 9.1 Criar projeto no Google Cloud Console

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um novo projeto: `sigma-backup`
3. Habilite a **Google Drive API**

### 9.2 Criar credenciais OAuth

1. Vá em **APIs & Services → Credentials**
2. Crie **OAuth 2.0 Client ID** (tipo: Web Application)
3. Adicione URI de redirecionamento: `https://developers.google.com/oauthplayground`
4. Copie: `Client ID` e `Client Secret`

### 9.3 Gerar Refresh Token

1. Acesse [OAuth Playground](https://developers.google.com/oauthplayground)
2. Clique na engrenagem → marque "Use your own OAuth credentials"
3. Insira seu Client ID e Secret
4. Selecione escopo: `https://www.googleapis.com/auth/drive`
5. Clique "Authorize APIs" → faça login
6. Clique "Exchange authorization code for tokens"
7. Copie o `refresh_token`

### 9.4 Criar pasta no Drive

1. Crie uma pasta no Google Drive chamada "SIGMA_BACKUP"
2. Copie o ID da pasta (da URL: `drive.google.com/drive/folders/**ID_AQUI**`)
3. Adicione ao `.env`: `GOOGLE_DRIVE_FOLDER_ID=ID_COPIADO`

---

## PASSO 10 — Pós-deploy: Configurações Iniciais

### 10.1 Acesse o sistema

```
URL de cobertura: https://seu-dominio.com (aparência de empresa de entregas)
Login: https://seu-dominio.com/login
```

### 10.2 Configure como Super Administrador

1. Faça login com `admin@sigma.local`
2. Vá em **Configurações → Sistema**
3. Configure:
   - Provedor de IA (OpenAI ou Gemini)
   - Nome da organização
   - Modo de exibição pública
   - Habilitar backup no Drive

### 10.3 Crie os grupos/setores

1. Vá em **Admin → Grupos/Setores**
2. Crie os núcleos necessários (ex: NÚCLEO DE VILHENA, NÚCLEO CENTRAL)

### 10.4 Crie os usuários

1. Vá em **Admin → Usuários**
2. Crie os usuários atribuindo funções e grupos
3. Compartilhe as credenciais de forma segura

---

## ESTRUTURA DE PERMISSÕES

| Função | Pode ver | Pode criar | Pode gerenciar |
|--------|----------|------------|----------------|
| **Operador** | RELINTs do próprio grupo, chat do grupo | RELINTs do grupo | Apenas próprios dados |
| **Administrador** | RELINTs de todos os grupos, todos os arquivos | RELINTs, importar arquivos | Usuários (exceto super admin) |
| **Super Admin** | Tudo | Tudo | Tudo: configs, grupos, templates, auditoria |

---

## MANUTENÇÃO

### Atualizar o sistema

```bash
# Na máquina local
git add .
git commit -m "atualização"
git push origin main
# O Coolify fará o deploy automaticamente!
```

### Backup manual do banco de dados

```bash
docker exec sigma_db pg_dump -U sigma_user sigma_db > backup_$(date +%Y%m%d).sql
```

### Restaurar backup

```bash
cat backup_YYYYMMDD.sql | docker exec -i sigma_db psql -U sigma_user sigma_db
```

### Ver logs da aplicação

```bash
docker logs sigma_app -f --tail=100
```

### Reiniciar serviços

```bash
docker compose restart app
docker compose restart db
```

---

## TROUBLESHOOTING

### App não inicia

```bash
docker logs sigma_app
# Verifique se o DATABASE_URL está correto
# Verifique se o banco está rodando: docker ps
```

### Erro de migração Prisma

```bash
docker exec -it sigma_app sh
npx prisma db push --force-reset  # ATENÇÃO: apaga todos os dados!
npx tsx prisma/seed.ts
```

### Coolify não faz deploy automático

1. Verifique se os Secrets do GitHub estão corretos
2. Verifique os logs do GitHub Actions
3. Confirme que o Webhook URL está atualizado no Coolify

### HTTPS não funciona

1. Verifique se o DNS propagou: `nslookup seu-dominio.com`
2. No Coolify, vá em **Proxy → Force HTTPS**
3. Regenere o certificado SSL

---

## SEGURANÇA OPERACIONAL

1. **Altere todas as senhas padrão** no primeiro acesso
2. **Use HTTPS** — nunca acesse via HTTP em produção
3. **Geolocalização** — todos os usuários terão localização rastreada ao logar
4. **Auditoria** — todos os acessos e ações ficam registrados
5. **Compartimentação** — usuários só veem dados do próprio grupo
6. **Backup diário** — configure via Coolify Cron Jobs ou Google Drive
7. **VPN recomendada** — considere usar Wireguard na VPS para acesso administrativo

---

## RESUMO DO FLUXO DE AUTO-DEPLOY

```
git push → GitHub → GitHub Actions → Coolify Webhook → Build Docker → Deploy automático
```

**Tempo médio de deploy: 3-5 minutos**

---

*Documentação classificada — uso interno restrito*
