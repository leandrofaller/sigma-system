---
name: headroom
description: >
  Context optimization and token compression layer. Compresses logs, files, tool outputs, and JSON before they reach the LLM, saving 60-95% of tokens. Uses local-first algorithms (JSON crusher, code AST compressor, and Kompress text compressor) with reversible caching (CCR).
---

Use a skill `headroom` para gerenciar, compactar e otimizar os dados de contexto, logs extensos ou códigos antes de processá-los ou enviá-los em iterações de LLM de alto custo de token.

## Como Usar o Headroom CLI

O `headroom` está instalado no ambiente virtual do backend (`backend\.venv\Scripts\headroom`). Sempre execute os comandos do CLI utilizando o caminho do executável do virtualenv e o prefixo `.\rtk.cmd` para otimização de tokens de console.

### 1. Comprimir Arquivos ou Outputs Grandes
Para ler arquivos muito extensos, logs de erro longos ou JSONs gigantes sem estourar o limite de tokens, passe o conteúdo para o compressor do headroom:
```bash
# Comprimir um arquivo JSON ou texto no console
.\rtk.cmd backend\.venv\Scripts\headroom compress --file caminho/do/arquivo.json

# Comprimir a saída de um comando longo
.\rtk.cmd backend\.venv\Scripts\headroom compress --command "cargo test"
```

### 2. Iniciar o Proxy de Compressão Local
Caso queira rotear chamadas de API de modelo através do proxy de compressão local para reduzir drasticamente o consumo de tokens:
```bash
.\rtk.cmd backend\.venv\Scripts\headroom proxy --port 8787
```

### 3. Analisar Sessões e Aprender (headroom learn)
O headroom pode analisar logs de sessões anteriores para extrair aprendizados e atualizar as regras em `AGENTS.md` ou `CLAUDE.md`:
```bash
.\rtk.cmd backend\.venv\Scripts\headroom learn
```

### 4. Consultar Estatísticas de Economia
Para ver o histórico de compressão e a porcentagem de tokens economizados localmente:
```bash
.\rtk.cmd backend\.venv\Scripts\headroom stats
```

## Integração como Servidor MCP
Quando configurado como um servidor MCP, o headroom expõe as seguintes ferramentas que você pode invocar diretamente:
- `headroom_compress`: Compacta textos, códigos ou JSONs fornecidos.
- `headroom_retrieve`: Recupera o conteúdo original não compactado caso o modelo precise de detalhes exatos (reversibilidade do CCR via TTL).
- `headroom_stats`: Exibe métricas de eficiência e economia de tokens.
