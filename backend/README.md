# SIPE Integration Backend — Python SDK & FastAPI

Este diretório contém a implementação do **`SIPEClient`** em Python para integração autorizada com o Sistema Integrado Penitenciário de Rondônia (SIPE), substituindo as consultas lentas de navegador (Playwright) por requisições HTTP diretas e parsing de HTML.

---

## 🔒 Segurança de Cookies (Importante)
A autenticação com o SIPE depende de dois cookies de sessão:
1. `laravel_session_sipe`
2. `XSRF-TOKEN`

> [!WARNING]
> - **Nunca** salve cookies, tokens ou senhas no código-fonte.
> - Os cookies de sessão expiram periodicamente e devem ser atualizados no arquivo `.env` local.
> - Proteja o arquivo `.env` para que ele nunca seja exposto publicamente.

---

## 🚀 Configuração do Ambiente

1. **Configurar o Arquivo `.env`**:
   Copie as variáveis do arquivo `.env.example` para o seu arquivo `.env` na raiz do projeto (ou no diretório `backend/`) e preencha com os cookies da sua sessão ativa no SIPE:
   ```env
   SIPE_BASE_URL=https://sipe.sejus.ro.gov.br
   SIPE_COOKIE_LARAVEL_SESSION=sua_sessao_ativa_laravel
   SIPE_COOKIE_XSRF_TOKEN=seu_token_xsrf_ativo
   ```

2. **Criar e Ativar Ambiente Virtual**:
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # Linux/macOS:
   source .venv/bin/activate
   ```

3. **Instalar Dependências**:
   ```bash
   pip install -r requirements.txt
   ```

---

## 🏃 Como Rodar a API FastAPI

Inicie o servidor de desenvolvimento utilizando o Uvicorn de dentro de `backend/app/`:
```bash
# De dentro do diretório f:/relatorio_claude/backend
$env:PYTHONPATH="app" # Windows PowerShell
# Ou export PYTHONPATH="app" no Linux/macOS
.venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

### 🧪 Testando as Rotas da API

Uma vez rodando, você pode realizar chamadas GET:

1. **Pesquisar Apenado**:
   ```text
   GET http://localhost:8000/sipe/pesquisar?termo=Joao
   ```
   *Retorna:* Lista JSON de resultados contendo `id`, `nome` aproximado e `url`.

2. **Obter Informações do Apenado**:
   ```text
   GET http://localhost:8000/sipe/apenado/{id}/informacoes
   ```
   *Retorna:* Ficha de informações do apenado estruturada em JSON (CPF, cela, processo, data de nascimento, foto).

3. **Ficha Completa**:
   ```text
   GET http://localhost:8000/sipe/ficha-completa?termo=Joao
   ```
   *Retorna:* Pesquisa pelo termo e retorna diretamente a ficha do primeiro resultado em JSON.

---

## 🧪 Rodando os Testes Unitários

Executamos testes síncronos simulando o HTML do SIPE para validar a extração de dados e tratamento de erros de sessão e registros ausentes.
Para rodar os testes:
```bash
# De dentro do diretório f:/relatorio_claude
$env:PYTHONPATH="backend/app"; backend\.venv\Scripts\python -m pytest backend\app\tests\
```
