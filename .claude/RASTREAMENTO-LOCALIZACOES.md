# Sistema Completo de Rastreamento Contínuo de Geolocalização

## Resumo da Implementação

Implementado sistema enterprise-grade de rastreamento contínuo de localização de policiais com auditoria completa, segurança role-based e zero impacto no código existente.

**Status**: ✅ Completo e deployable
**Branch**: `feature/rastreamento-continuo-localizacoes`
**Commits**: 1 (853fea3)

---

## 📊 Arquitetura Técnica

### 1. Modelos de Dados (Prisma Schema)

#### OfficerLocationTracking
Registra cada ponto de localização coletado:
```
- id: String (CUID, primary key)
- userId: String (foreign key → User)
- user: User (relation)
- latitude: Float
- longitude: Float
- accuracy?: Float (margem de erro em metros)
- altitude?: Float (elevação)
- speed?: Float (velocidade m/s)
- timestamp: DateTime (auto-populated)
- deviceId?: String (identificador do dispositivo)
- source: String (default "GPS")
- batteryLevel?: Int (percentual da bateria)
- Indexes: userId, timestamp, userId+timestamp
```

#### LocationAudit
Log de auditoria de todos os acessos administrativos:
```
- id: String (CUID, primary key)
- adminId: String (foreign key → User, quem acessou)
- admin: User (relation)
- officerId: String (quem foi consultado, pode ser vazio para "mapa geral")
- officer?: User (relation com soft-delete)
- action: String ("VIEW_ALL_LOCATIONS_MAP" | "VIEW_LOCATION_HISTORY")
- details?: String (contexto da ação)
- ipAddress?: String (IP do admin)
- userAgent?: String (browser/app do admin)
- timestamp: DateTime (auto-populated)
```

#### LocationConsent
Rastreamento de consentimento (compatível com documentos físicos assinados):
```
- id: String (CUID, primary key)
- userId: String (unique, foreign key → User)
- user: User (relation)
- consentGiven: Boolean (default false)
- consentDate?: DateTime (quando foi dado)
- consentDocumentId?: String (ID do documento físico ou digital)
- revokedAt?: DateTime (quando foi revogado, se aplicável)
- revokedReason?: String (motivo da revogação)
```

---

### 2. API Endpoints

#### POST /api/officers/locations
**Uso**: Registrar nova localização (chamado periodicamente pela app mobile)
**Auth**: Requer sessão de usuário
**Validações**:
- Valida latitude e longitude obrigatórias
- Verifica consentimento do usuário em LocationConsent
- Retorna 403 se sem consentimento

**Request**:
```json
{
  "latitude": -23.550520,
  "longitude": -46.633309,
  "accuracy": 5.5,
  "altitude": 745.2,
  "speed": 0.0,
  "deviceId": "web-client",
  "source": "GPS",
  "batteryLevel": 85
}
```

**Response** (201):
```json
{
  "location": {
    "id": "...",
    "userId": "...",
    "latitude": -23.550520,
    "longitude": -46.633309,
    "timestamp": "2026-06-02T10:30:00Z"
  }
}
```

---

#### GET /api/officers/locations
**Uso**: Obter localização atual de todos os policiais
**Auth**: Requer SUPER_ADMIN ou ADMIN
**Auditoria**: Registra acesso com ação "VIEW_ALL_LOCATIONS_MAP"
**Features**:
- Retorna apenas última localização por policial
- Inclui info do usuário (name, email)
- Inclui bateria, acurácia, timestamp

**Query Params**: Nenhum
**Response** (200):
```json
{
  "locations": [
    {
      "userId": "user-id-1",
      "user": {
        "id": "user-id-1",
        "name": "João Silva",
        "email": "joao@pmesp.sp.gov.br"
      },
      "latitude": -23.550520,
      "longitude": -46.633309,
      "accuracy": 5.5,
      "timestamp": "2026-06-02T10:30:00Z",
      "source": "GPS",
      "batteryLevel": 85
    }
  ]
}
```

---

#### GET /api/officers/[id]/locations/history
**Uso**: Visualizar histórico de localização de um policial específico
**Auth**: Requer SUPER_ADMIN ou ADMIN
**Auditoria**: Registra acesso com ação "VIEW_LOCATION_HISTORY" + IP

**Query Params**:
- `days` (default 7): Últimos N dias
- `limit` (default 1000): Máximo de registros

**Response** (200):
```json
{
  "officer": {
    "id": "user-id-1",
    "name": "João Silva",
    "email": "joao@pmesp.sp.gov.br"
  },
  "count": 150,
  "period": {
    "from": "2026-05-26T10:30:00Z",
    "to": "2026-06-02T10:30:00Z",
    "days": 7
  },
  "history": [
    {
      "id": "loc-123",
      "latitude": -23.550520,
      "longitude": -46.633309,
      "accuracy": 5.5,
      "altitude": 745.2,
      "speed": 0.0,
      "timestamp": "2026-06-02T10:30:00Z",
      "source": "GPS",
      "batteryLevel": 85
    }
  ]
}
```

---

#### GET /api/officers/locations/audit
**Uso**: Consultar log de auditoria de acessos
**Auth**: Requer SUPER_ADMIN ou ADMIN
**Features**:
- Agrupa acessos por tipo de ação
- Inclui IP, timestamp, admin e policial
- Ordenado por timestamp descendente

**Query Params**:
- `days` (default 7): Últimos N dias
- `limit` (default 500): Máximo de registros

**Response** (200):
```json
{
  "count": 42,
  "period": {
    "from": "2026-05-26T10:30:00Z",
    "to": "2026-06-02T10:30:00Z",
    "days": 7
  },
  "byAction": {
    "VIEW_ALL_LOCATIONS_MAP": 15,
    "VIEW_LOCATION_HISTORY": 27
  },
  "audits": [
    {
      "id": "audit-123",
      "adminId": "admin-id-1",
      "admin": {
        "name": "Maria Admin",
        "email": "maria@pmesp.sp.gov.br"
      },
      "officerId": "user-id-5",
      "officer": {
        "name": "Pedro Investigador",
        "email": "pedro@pmesp.sp.gov.br"
      },
      "action": "VIEW_LOCATION_HISTORY",
      "details": "Últimos 7 dias",
      "ipAddress": "192.168.1.100",
      "timestamp": "2026-06-02T10:35:00Z"
    }
  ]
}
```

---

### 3. Componentes React

#### OfficerLocationMap
**Path**: `src/components/admin/OfficerLocationMap.tsx`
**Tipo**: Client component
**Propósito**: Exibir mapa em tempo real de policiais

**Features**:
- Grid responsivo de cartões com policiais
- Auto-refresh a cada 10 segundos
- Botão "Visualizar Histórico" → navega para `/admin/monitoramento/historico/[id]`
- Botão "Exportar CSV" → download com últimos 7 dias
- Indicador de bateria com cores (verde >50%, amarelo >20%, vermelho ≤20%)
- Status de acurácia GPS
- Timestamp da última localização

**Props**: Nenhuma (fetcha direto da API)

**State**:
- `locations`: Array de localizações atuais
- `loading`, `error`: Estados de carregamento
- `autoRefresh`: Toggle para atualização automática

---

#### OfficerLocationHistory (Client Component)
**Path**: `src/app/(dashboard)/admin/monitoramento/historico/[id]/client.tsx`
**Propósito**: Visualizar histórico detalhado de um policial

**Features**:
- 4 Cards com stats (total pontos, acurácia média, vel. máxima, bateria média)
- 2 Gráficos Recharts:
  - AreaChart: Acurácia do GPS ao longo do tempo
  - LineChart: Velocidade em km/h
- Tabela detalhada com filtros por período/limite
- Exportação CSV com dados completos
- Conversão de velocidade de m/s para km/h

**Dados Exibidos**:
- Data/Hora (formato local)
- Latitude/Longitude (6 decimais)
- Acurácia em metros
- Altitude em metros
- Velocidade em km/h
- Nível de bateria (%)
- Fonte (GPS, etc)

---

#### LocationAuditClient
**Path**: `src/app/(dashboard)/admin/monitoramento/auditoria/client.tsx`
**Propósito**: Visualizar log de auditoria

**Features**:
- 3 Cards com stats (total, período, tipos de ação)
- Filtros por período (1d, 7d, 30d, 90d, 1y) e limite
- Tabela com: timestamp, admin (nome+email), policial, ação, detalhes, IP
- Cores customizadas por tipo de ação
- Exportação CSV

**Ações Suportadas**:
- `VIEW_ALL_LOCATIONS_MAP` → "Mapa de Localizações" (azul)
- `VIEW_LOCATION_HISTORY` → "Ver Histórico" (roxo)

---

### 4. Hook de Rastreamento

#### useLocationTracking
**Path**: `src/hooks/useLocationTracking.ts`
**Propósito**: Gerenciar coleta contínua de localização via Geolocation API

**Como Funciona**:
1. Inicia `navigator.geolocation.watchPosition()` para rastreamento contínuo
2. A cada nova posição, armazena em cache local (ref)
3. A cada 30s, envia localização para servidor via POST
4. Tenta ler nível de bateria via Battery Status API (se disponível)
5. Em caso de offline, silenciosamente falha (não quebra app)

**Options**:
```typescript
{
  enabled?: boolean          // default: true
  interval?: number          // ms entre uploads (default: 30000)
  highAccuracy?: boolean     // default: true
  timeout?: number           // timeout de geolocation em ms
  maximumAge?: number        // cache de localização anterior
}
```

**Retorno**:
```typescript
{
  location?: {
    latitude: number
    longitude: number
    accuracy?: number
    altitude?: number
    speed?: number
    heading?: number
    timestamp: number
  }
  error?: string
  tracking: boolean
  stop: () => void
}
```

**Uso Típico**:
```typescript
const { location, error, tracking } = useLocationTracking({
  enabled: true,
  interval: 30000,
})

useEffect(() => {
  if (location) {
    console.log(`Localizado em ${location.latitude}, ${location.longitude}`)
  }
}, [location])
```

---

### 5. Páginas Server

#### /admin/monitoramento (página principal)
**Path**: `src/app/(dashboard)/admin/monitoramento/page.tsx`
**Alterações**: 
- Adicionado import de `OfficerLocationMap`
- Novo seção "Monitoramento de Localização de Policiais" com mapa em tempo real
- Link para auditoria (`📋 Auditoria`)
- Mantém seção original "Monitoramento de Sessão" com GeoMonitorPanel

---

#### /admin/monitoramento/historico/[id]
**Path**: `src/app/(dashboard)/admin/monitoramento/historico/[id]/page.tsx`
**Propósito**: Servidor que valida auth, carrega info do policial

**Features**:
- Redireciona para login se não autenticado
- Redireciona para dashboard se não SUPER_ADMIN/ADMIN
- Redireciona para main se policial não existe
- Calcula total de registros do policial
- Passa info para componente client

---

#### /admin/monitoramento/auditoria
**Path**: `src/app/(dashboard)/admin/monitoramento/auditoria/page.tsx`
**Propósito**: Página de auditoria (servidor)

**Features**:
- Mesmas validações de auth
- Simples wrapper que passa componente client

---

## 🔐 Segurança e Auditoria

### Controle de Acesso
```
POST /api/officers/locations
  ✓ Requer sessão válida
  ✓ Verifica LocationConsent do usuário
  ✓ Retorna 403 se sem consentimento

GET /api/officers/locations
  ✓ Requer SUPER_ADMIN ou ADMIN
  ✓ Registra auditoria com IP
  ✗ Recusa usuários normais

GET /api/officers/[id]/locations/history
  ✓ Requer SUPER_ADMIN ou ADMIN
  ✓ Registra auditoria com IP, period
  ✗ Recusa usuários normais

GET /api/officers/locations/audit
  ✓ Requer SUPER_ADMIN ou ADMIN
  ✓ Apenas admins veem o log
  ✗ Recusa usuários normais
```

### Auditoria
Cada acesso administrativo é registrado com:
- **adminId**: Quem acessou
- **officerId**: Quem foi consultado (vazio para mapa geral)
- **action**: Tipo de acesso (VIEW_ALL_LOCATIONS_MAP, VIEW_LOCATION_HISTORY)
- **ipAddress**: IP da requisição
- **timestamp**: Quando aconteceu
- **details**: Contexto (ex: "Últimos 7 dias")

Acesso via:
```
GET /admin/monitoramento/auditoria
```

---

## 🚀 Fluxo Completo de Uso

### Operador (Policial com App)
1. App inicializa `useLocationTracking()`
2. Browser pede permissão de geolocalização
3. Usuário permite (ou já foi autorizado)
4. Hook começa coleta contínua via `watchPosition()`
5. A cada 30s, POST para `/api/officers/locations`
6. Servidor valida consentimento e armazena em `OfficerLocationTracking`

### Gestor (Visualização em Tempo Real)
1. Acessa `/admin/monitoramento`
2. Visualiza seção "Monitoramento de Localização de Policiais"
3. Vê grid com todos os policiais online
4. Pode clicar em "Histórico" → vai para `/admin/monitoramento/historico/[id]`

### Investigador (Análise Histórica)
1. Clica "Histórico" de um policial
2. Visualiza página com:
   - Gráfico de acurácia do GPS
   - Gráfico de velocidade
   - Tabela com todos os pontos
3. Pode filtrar por período (1, 7, 30, 90 dias)
4. Pode exportar CSV

### Compliance Officer (Auditoria)
1. Clica "Auditoria" no mapa
2. Visualiza `/admin/monitoramento/auditoria`
3. Vê log de todos os acessos:
   - Quem acessou (admin)
   - Quando acessou (timestamp)
   - De qual IP
   - Qual policial foi consultado
4. Pode filtrar por período
5. Pode exportar CSV para relatórios

---

## 📈 Métricas de Performance

### Consumo de Banda
- POST `/api/officers/locations`: ~200 bytes (payload JSON)
- **Frequência**: 30s interval → ~288 requisições/dia por policial
- **Custo**: 200B × 288 = ~57.6 KB/policial/dia

### Armazenamento (100 policiais)
- 1 ponto × 30s interval = 2,880 pontos/dia
- ~120 bytes por registro = ~345 KB/dia para 100 policiais
- **30 dias**: ~10.35 MB
- **1 ano**: ~126 MB (negligenciável)

### Auditoria
- 1 registro (~500B) por acesso admin
- ~50 acessos/dia × 500B = 25 KB/dia
- **1 ano**: ~9.1 MB

---

## ✅ Checklist de Verificação

- [x] Modelos Prisma criados e migrados (`prisma db push`)
- [x] 4 endpoints API implementados e funcionando
- [x] Hook `useLocationTracking` pronto para integração mobile
- [x] Componente `OfficerLocationMap` funcional
- [x] Página de histórico com gráficos
- [x] Página de auditoria com log completo
- [x] Integração no dashboard (/admin/monitoramento)
- [x] Validações de permissão em todos endpoints
- [x] Logging de auditoria em GET endpoints administrativos
- [x] Conversão de unidades (m/s → km/h)
- [x] Exportação CSV (histórico e auditoria)
- [x] Sem quebra de código existente
- [x] Sem modificação em modelos/tabelas existentes
- [x] Build TypeScript passando
- [x] Commit feito e pushed

---

## 📝 Próximos Passos (Opcionais)

1. **Integração Mobile**
   - Importar `useLocationTracking` em app mobile
   - Chamar hook após login
   - Testar com dispositivos reais

2. **Mapa Visual (Google Maps)**
   - Integrar Google Maps API em `OfficerLocationMap`
   - Exibir pins dos policiais no mapa
   - Adicionar polyline de trajeto

3. **Alertas em Tempo Real**
   - WebSocket ou Server-Sent Events para notificações
   - Alertar quando policial sai de zona
   - Histórico de geofences

4. **Analytics**
   - Dashboard com heatmaps de atividade
   - Tempo médio por área
   - Estatísticas de cobertura

5. **Consentimento UI**
   - Página para policiais gerarem/consultarem status de consentimento
   - Auditoria de quem revogou consentimento

---

## 🛠️ Troubleshooting

### API retorna 403 "Acesso restrito"
- Verificar `user.role` do token JWT
- Deve ser `SUPER_ADMIN` ou `ADMIN`
- Se admin, verificar token expirado

### Histórico vazio
- Verificar se LocalizationConsent.consentGiven = true
- Verificar se hook está sendo chamado
- Verificar logs do servidor

### Gráficos não aparecem
- Verificar se Recharts está instalado
- Verificar console do browser (errors)
- Testar fetch direto: `curl /api/officers/{id}/locations/history`

---

## 📚 Referências

- **Geolocation API**: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- **Battery Status API**: https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API
- **Recharts**: https://recharts.org/
- **Prisma Docs**: https://www.prisma.io/docs/
- **Next.js API Routes**: https://nextjs.org/docs/api-routes/introduction

---

**Implementado por**: Claude (AI Assistant)
**Data**: 2026-06-02
**Branch**: `feature/rastreamento-continuo-localizacoes`
**Commit**: 853fea3

Documentação completa e sistema pronto para produção.
