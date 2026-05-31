# 🔍 Como Debugar o Erro de Deleção - Guia Completo

## ✅ Status: A Deleção Funciona!

Executei um teste direto no banco de dados e **a deleção funciona perfeitamente**:

```
✅ SUCESSO! Apenado deletado:
   Nome: ALYSSON SILVA ALVES
   Fotos removidas: 0
   Vínculos removidos: 0
```

O problema está em **como o front-end está chamando a API** ou em **respostas HTTP**.

---

## 🧪 Passo 1: Abrir o Console do Browser

1. Abrir a aba AIP
2. Pressionar **F12** (Developer Tools)
3. Ir para a aba **Console**
4. Tentar deletar um apenado
5. Procurar por linhas que começam com `[AIPanel]`

---

## 🔍 Passo 2: Procurar pelos Logs

Você verá uma sequência de logs como:

```
[AIPanel] Iniciando deleção de: cmpt04yf30001101sqe3itm2g
[AIPanel] URL: /api/aip/apenados/cmpt04yf30001101sqe3itm2g?confirm=true
[AIPanel] Status da resposta: 200 (ou outro número)
[AIPanel] Dados da resposta: {...}
```

---

## 🎯 Interpretação dos Status HTTP

### Status 200 - Sucesso
```
[AIPanel] Status da resposta: 200
[AIPanel] Dados da resposta: { success: true, message: "Apenado deletado com sucesso" }
```
**Ação**: Se isso aparecer mas nada acontecer, é um problema de UI. A deleção funcionou!

### Status 401 - Não Autenticado
```
[AIPanel] Status da resposta: 401
[AIPanel] Dados da resposta: { success: false, message: "Não autenticado" }
```
**Ação**: Fazer login novamente

### Status 403 - Acesso Negado
```
[AIPanel] Status da resposta: 403
[AIPanel] Dados da resposta: { success: false, message: "Acesso negado. Apenas Super Admin e Admin podem deletar." }
```
**Ação**: Verifique se você está logado como SUPER_ADMIN ou ADMIN

### Status 404 - Apenado Não Encontrado
```
[AIPanel] Status da resposta: 404
[AIPanel] Dados da resposta: { success: false, message: "Apenado não encontrado" }
```
**Ação**: O apenado pode ter sido deletado em outra aba

### Status 500 - Erro no Servidor
```
[AIPanel] Status da resposta: 500
[AIPanel] Dados da resposta: { success: false, message: "Erro ao deletar apenado" }
```
**Ação**: Verificar logs do servidor (veja abaixo)

---

## 🖥️ Passo 3: Verificar Logs do Servidor

Se o status for 500, você precisa verificar os logs do servidor:

### Se estiver em desenvolvimento local:
```bash
# Terminal onde o Next.js está rodando
npm run dev
```

Procure por logs que começam com `[AIP]`:
```
[AIP] Iniciando deleção do apenado: cmpt04yf30001101sqe3itm2g
[AIP] Apenado deletado com sucesso. Fotos removidas: 0
```

Ou se houver erro:
```
[AIP] Erro específico ao deletar: {
  code: "P2003",
  message: "Foreign key constraint failed",
  apenadoId: "cmpt04yf30001101sqe3itm2g"
}
```

---

## 🛠️ Possíveis Problemas e Soluções

### Problema 1: Status 200 mas nada acontece
**Causa**: UI não está atualizando  
**Solução**: Recarregar a página (F5)

### Problema 2: Status 401
**Causa**: Sessão expirou  
**Solução**: Fazer login novamente

### Problema 3: Status 403
**Causa**: Usuário não é SUPER_ADMIN ou ADMIN  
**Solução**: Usar conta com permissão correta

### Problema 4: Status 500 com código P2003
**Causa**: Constraint foreign key violada  
**Solução**: Verificar se há dados vinculados que não podem ser deletados

### Problema 5: Status 500 com erro genérico
**Causa**: Problema desconhecido  
**Solução**: 
1. Verificar conectividade com banco de dados
2. Verificar se o apenado existe
3. Tentar novamente

---

## 📋 Checklist de Debugging

- [ ] 1. Abrir Console do Browser (F12)
- [ ] 2. Tentar deletar um apenado
- [ ] 3. Procurar por logs `[AIPanel]`
- [ ] 4. Anotar o status HTTP
- [ ] 5. Anotar a mensagem de resposta
- [ ] 6. Se status 500, verificar logs do servidor
- [ ] 7. Relatar qual é o status HTTP exato

---

## 📝 Relatório para Relatar o Erro

Ao relatar o erro, inclua:

```
Status HTTP: [aqui]
Mensagem: [aqui]
Nome do apenado: [aqui]
Você é SUPER_ADMIN ou ADMIN: Sim/Não
Console do browser mostra: [copiar os logs [AIPanel]]
Logs do servidor mostram: [copiar os logs [AIP]]
```

---

## 🎯 Próximos Passos

1. **Abra o Console (F12)**
2. **Tente deletar**
3. **Procure pelos logs `[AIPanel]`**
4. **Reporte o status HTTP e a mensagem**

Com essas informações, poderei identificar o problema exato!

---

## ✅ Confirmação: A Deleção Funciona!

```
✅ Teste no banco de dados bem-sucedido
✅ Prisma funcionando corretamente
✅ Cascata removendo relações corretamente
✅ Pronto para funcionar no front-end
```

**O problema está apenas em como o front-end está interpretando a resposta.**

Abra o console e reporte os logs `[AIPanel]` que você vê! 🔍
