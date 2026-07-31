# PRD — Dashboard de métricas agregadas por barbeiro, visível para dono e admin, estendendo o billing summary existente

## 1) Objetivo
- Entregar um dashboard de métricas agregadas, segmentado por barbeiro (`adminId`), visível
  apenas para os papéis `DONO` e `ADMIN`, permitindo comparar performance entre profissionais
  (faturamento, quantidade de atendimentos concluídos, ticket médio).
- Hoje `BillingController.getSummary` calcula essas métricas de forma **global** (soma de todos os
  agendamentos `COMPLETED`, sem segmentar por profissional) e é acessível também por `BARBEIRO`.
  Não existe hoje nenhuma visão "acima do nível barbeiro" que compare profissionais entre si — é
  esse o valor que este epic entrega: visibilidade gerencial (dono/admin) sobre o negócio como um
  todo, por barbeiro.

## 2) Escopo
**Inclui**
- Novo endpoint (ou extensão aditiva do existente) que retorna métricas agregadas **por barbeiro**
  (`adminId`), restrito a `DONO`/`ADMIN`.
- Novo componente/página de frontend em `/barber` reaproveitando o padrão visual de
  `BillingDashboard.tsx` (cards de métricas + tabela), mas com uma linha/bloco por barbeiro.
- Guard de rota restrito a `dono`/`admin` (mesmo padrão de `/barber/configuracoes` e
  `/barber/usuarios`, Epics 2/4/5).
- Link de navegação no `BarberHeader`, visível só para `dono`/`admin`.

**Não inclui (fora de escopo)**
- Alterar o endpoint/página de billing individual existente (`GET /billing/summary`,
  `/barber/billing`) usado hoje por `BARBEIRO` para ver o próprio faturamento — continua como está.
- Filtros de período (data inicial/final) — hoje `getSummary` não tem filtro de data; este epic
  não introduz um, apenas segmenta por barbeiro o que já existe (todos os `COMPLETED` históricos).
- Gráficos/visualizações avançadas (charts) — o padrão visual reaproveitado (`BillingDashboard.tsx`)
  usa cards + tabela HTML, sem biblioteca de gráficos; mantém-se a mesma linguagem visual.
- Exportação de relatórios (CSV/PDF).
- Métricas de agenda/ocupação (nº de horários vagos, taxa de ocupação) — fora do que
  `BillingController` já calcula hoje.

## 3) Fluxo atual (como funciona hoje)
`BillingController.getSummary` (`barbearia-backend/src/controllers/billing.controller.ts`) busca
todos os `Appointment` com `status: 'COMPLETED'` (incluindo `service`), soma o preço do serviço de
cada um para `totalRevenue`, calcula `totalAppointments` e `averageTicket`, e agrupa por
**nome do serviço** em `servicesBreakdown` — nunca por barbeiro. A rota
`GET /billing/summary` (`barbearia-backend/src/routes/index.ts:29`) está protegida por
`authMiddleware` + `requireRole('BARBEIRO', 'DONO', 'ADMIN')` — ou seja, qualquer staff logado
(inclusive um barbeiro individual) vê o resumo **global** de todos os barbeiros, sem segmentação.

No frontend, `BillingDashboard.tsx` (`barbearia-shelby-frontend/src/app/barber/billing/`) consome
esse endpoint via `useBarberData().billingSummary` (chamada `GET /billing/summary` em
`barbearia-shelby-frontend/src/hooks/useBarberData.tsx:61`) e renderiza 3 cards (faturamento
total, serviços concluídos, ticket médio) + uma tabela de performance por serviço. A página
`/barber/billing` (`.../barber/billing/page.tsx`) não tem guard de role próprio — herda apenas o
guard geral de `/barber` (`barbeiro`, `dono`, `admin` — ver `barber/layout.tsx`), então é acessível
a qualquer staff, o que é intencional (cada barbeiro pode ver o resumo/seu próprio contexto de
faturamento hoje, ainda que hoje o número mostrado seja global e não individual).

`Appointment.adminId` (schema Prisma) já identifica o barbeiro responsável por cada agendamento —
usado desde o Epic 1 para filtrar disponibilidade (`AppointmentService.checkAvailability`) — e é
opcional (`Int?`), ou seja, agendamentos podem existir sem barbeiro atribuído.

## 4) Fluxo desejado (comportamento esperado)
- Dono ou admin logado acessa uma nova rota dedicada em `/barber` (ex.: `/barber/dashboard` ou
  nome equivalente — a decidir na fase de planejamento) e vê métricas agregadas **por barbeiro**:
  para cada `User` com `role: BARBEIRO`, quantos agendamentos `COMPLETED`, quanto faturamento total
  e ticket médio esse barbeiro gerou.
- Barbeiros com zero atendimentos concluídos aparecem no dashboard com métricas zeradas (não
  somem da lista), permitindo ao dono ver quem está sem movimento.
- Agendamentos `COMPLETED` sem `adminId` (caso hoje possível no schema) são segregados numa
  categoria separada ("sem barbeiro atribuído") ou explicitamente somados a um total geral — a
  decisão exata de como tratar esse caso fica para a fase de planejamento (Fase 2), mas deve ser
  coberta para não perder receita do total global.
- Barbeiro comum (role `BARBEIRO`), cliente e visitante **não** acessam essa nova página/endpoint —
  tentativa de acesso direto pela URL redireciona para `/Login` (mesmo padrão de
  `/barber/configuracoes`/`/barber/usuarios`); chamada direta à API sem token retorna 401, com
  papel não autorizado retorna 403.
- Link de navegação para a nova página aparece no `BarberHeader` somente para `dono`/`admin`
  (mesma condição já usada para os links "Configurações" e "Usuários").

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-backend/src/routes/index.ts:29` — declaração atual da rota
  `GET /billing/summary` (`authMiddleware` + `requireRole('BARBEIRO','DONO','ADMIN')`), montada
  direto no router principal (não tem arquivo `billing.routes.ts` dedicado).
- `barbearia-backend/src/controllers/billing.controller.ts` — único controller de billing hoje,
  classe `BillingController` com o método `getSummary`.
- `barbearia-shelby-frontend/src/app/barber/billing/page.tsx` — página atual de faturamento
  (global), sem guard de role próprio.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx` e
  `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx` — padrão de guard aninhado a
  reaplicar: `<ProtectedRoute allowedUserType={['dono', 'admin']}>`.
- `barbearia-shelby-frontend/src/app/barber/layout.tsx` — guard geral de `/barber`
  (`['barbeiro', 'dono', 'admin']`), herdado por qualquer subrota nova.

### 5.2 Domínio / Regras / Serviços
- `barbearia-backend/src/controllers/billing.controller.ts` — hoje concentra toda a lógica de
  agregação (busca + soma + agrupamento) direto no controller; não existe `billingService.ts` nem
  método relevante em `adminService.ts` hoje (`adminService.ts` só faz CRUD de staff — listAll,
  findById, update, delete — não tem nada de métricas/agregação).
- `barbearia-backend/src/services/appointmentService.ts:107` — `listBookableBarbers()`, método já
  existente que lista `User` com `role: 'BARBEIRO'` (`select: { id, name }`, `orderBy: name asc`) —
  candidato a reuso para obter a lista de barbeiros a segmentar.

### 5.3 Persistência / Modelos / Migrações
- `barbearia-backend/prisma/schema.prisma`:
  - `model User` (`id`, `name`, `email`, `role: UserRole`, `active`) — `role` inclui `BARBEIRO`.
  - `model Appointment` (`id`, `date`, `status: AppointmentStatus`, `adminId Int?`,
    `admin User? @relation("AppointmentStaff", ...)`, `serviceId`, `service Service`) — `status`
    inclui `COMPLETED`; `adminId` é opcional.
  - `model Service` (`id`, `name`, `price`, ...).
- Nenhuma tabela/coluna nova é necessária: todos os dados para agregação por barbeiro já existem
  (`Appointment.adminId` + `Appointment.status` + `Service.price`). Não há migration prevista para
  este epic, salvo decisão em contrário na Fase 2.

### 5.4 Integrações externas (clients/adapters/providers)
- Nenhuma integração externa envolvida (sem e-mail, WhatsApp, PDF, etc.) — feature é 100%
  leitura/agregação de dados já persistidos via Prisma.

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/app/barber/billing/BillingDashboard.tsx` — componente de
  referência visual: cards de métrica (`.metricsGrid` / `.metricCard`) + tabela de breakdown
  (`.tableContainer`). Padrão a reaproveitar para o novo dashboard (cards agregados no topo +
  tabela com uma linha por barbeiro).
- `barbearia-shelby-frontend/src/app/barber/billing/Billing.module.scss` — tokens de estilo já
  usados (`$card-bg: #1e1e1e`, `$border-color: #3a3a3a`, `$text-color: #f0f0f0`,
  `$text-muted: #a0a0a0`, `$brand-color: #f67366`) — candidatos a reuso/duplicação leve num novo
  módulo scss para manter consistência visual.
- `barbearia-shelby-frontend/src/hooks/useBarberData.tsx` — hook atual que busca `billingSummary`
  via `GET /billing/summary` (padrão de hook a replicar/estender para o novo endpoint: estado +
  `loading`/`error` + header `Authorization: Bearer <token>` via `useAuth().token`).
- `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` — outro exemplo do mesmo padrão de
  hook dedicado a uma tela de configuração (fetch com `api` + headers + estado local), usado por
  `/barber/configuracoes`.
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — componente de
  guard reutilizado por toda rota restrita; aceita `allowedUserType: UserType | UserType[]`.
- `barbearia-shelby-frontend/src/context/AuthContext.tsx:7` —
  `export type UserType = 'cliente' | 'barbeiro' | 'dono' | 'admin';` (valores em minúsculo,
  diferente do enum `UserRole` do backend que é maiúsculo).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx:51-60` —
  local onde os links "Configurações" e "Usuários" são renderizados condicionalmente para
  `dono`/`admin`; novo link do dashboard de métricas deve seguir o mesmo padrão
  (`auth.user?.userType === 'dono' || auth.user?.userType === 'admin'`).

### 5.6 Testes / Fixtures (se existirem)
- Não há testes automatizados (Jest/Cypress) cobrindo `billing.controller.ts` nem
  `BillingDashboard.tsx` hoje. `npm test` (frontend) não encontra nenhuma suíte no projeto
  atualmente (confirmado em epics anteriores desta mesma execução).

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — `requireRole(...roles: string[])`,
  usar `requireRole('DONO', 'ADMIN')` para a nova rota (mesmo padrão fixado no Epic 5).
- `barbearia-backend/src/middlewares/auth.middleware.ts` — popula `req.user.role` a partir do JWT.
- `barbearia-backend/src/services/appointmentService.ts:107` (`listBookableBarbers`) — já resolve
  "lista de barbeiros selecionáveis"; útil para garantir que barbeiros com zero atendimentos
  apareçam no dashboard mesmo sem nenhum `Appointment COMPLETED`.
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` +
  padrão de `layout.tsx` aninhado (`configuracoes/layout.tsx`, `usuarios/layout.tsx`) — replicar
  para a nova rota do dashboard.
- `barbearia-shelby-frontend/src/hooks/useBarberData.tsx` (função `fetchBillingSummary`) e
  `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` — dois exemplos concretos do
  padrão de hook (state + `api.get` com header `Authorization` via `useAuth().token` +
  `loading`/`error`) a seguir para o novo hook/chamada de dados do dashboard.
- `barbearia-shelby-frontend/src/app/barber/billing/BillingDashboard.tsx` +
  `Billing.module.scss` — padrão visual (cards + tabela) e tokens de cor a reaproveitar.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` — padrão
  de link condicional por `userType` no header.

## 7) Documentação externa (via Context7)
Feature é 100% interna (Express + Prisma + React já em uso no projeto, sem biblioteca nova).
Nenhuma consulta ao Context7 foi necessária — não há API nova de framework/lib envolvida; o
trabalho é agregação de dados via Prisma (`groupBy`/`findMany` já usados em outros pontos do
codebase, ex. `appointmentService.ts`) e composição de componentes React já estabelecidos no
projeto (sem novo pacote de UI/gráficos).

### Consultas realizadas
| Library ID | Query | Resumo do resultado |
|------------|-------|---------------------|
| — | — | Não aplicável — nenhuma lib nova introduzida por este epic. |

### Trechos relevantes
- Não aplicável.

## 8) Impactos prováveis (áreas afetadas)
- Backend — controller/rota: extensão aditiva em `billing.controller.ts` (novo método) e nova rota
  `GET` restrita a `DONO`/`ADMIN` em `routes/index.ts` (ou novo `billing.routes.ts` dedicado, a
  decidir na Fase 2).
- Backend — nenhuma alteração de schema Prisma esperada (dados já existem via `adminId`/`status`).
- Frontend — nova página/rota sob `/barber` com guard `['dono', 'admin']`, novo componente visual
  (baseado em `BillingDashboard.tsx`), novo módulo scss, e extensão de hook (ou hook novo) para
  buscar os dados agregados.
- Frontend — `BarberHeader.tsx` ganha um novo link condicional.
- Nenhum impacto em fluxo de cliente/visitante (`/`, `/Servicos`, `/Login`, `/CriarConta`,
  `/EsqueciSenha`, `/agendamento`, `/meus-servicos`) — regra transversal do roadmap preservada.

## 9) Critérios de aceitação
- [ ] Dono logado acessa a nova página de dashboard e vê métricas agregadas por barbeiro
      (faturamento total, atendimentos concluídos, ticket médio por barbeiro).
- [ ] Admin logado tem o mesmo acesso que o dono à nova página.
- [ ] Barbeiro logado não acessa a nova página (redirecionado, sem ver o link no header).
- [ ] Cliente logado e visitante não acessam a nova página nem o novo endpoint (401/redirect).
- [ ] Chamada direta ao novo endpoint sem token retorna 401; com token de papel não autorizado
      retorna 403.
- [ ] Barbeiro sem nenhum atendimento `COMPLETED` aparece no dashboard com métricas zeradas.
- [ ] Endpoint/página existentes de billing global (`/billing/summary`, `/barber/billing`)
      continuam funcionando exatamente como hoje, sem regressão.
- [ ] As 7 rotas da regra transversal do roadmap continuam acessíveis a visitante/cliente sem
      mudança de comportamento.

## 10) Open Questions (bloqueios / dúvidas)
- Nenhuma. Todas as decisões de modelagem necessárias (endpoint novo vs. extensão do existente,
  nome da rota/página, tratamento de agendamentos `COMPLETED` sem `adminId`) ficam para a Fase 2
  (Planejamento), a ser resolvidas com base em evidência do codebase já levantada acima.
