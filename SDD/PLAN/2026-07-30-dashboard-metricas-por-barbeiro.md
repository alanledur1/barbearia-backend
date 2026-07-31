# Dashboard de métricas agregadas por barbeiro, visível para dono e admin, estendendo o billing summary existente — Implementation Plan

## Overview
Hoje `BillingController.getSummary` calcula métricas de faturamento (`totalRevenue`,
`totalAppointments`, `averageTicket`, breakdown por serviço) de forma **global**, somando todos os
`Appointment` com `status: 'COMPLETED'`, sem segmentar por profissional. Vamos adicionar um novo
endpoint aditivo que agrega essas mesmas métricas **por barbeiro** (`adminId`), restrito aos
papéis `DONO`/`ADMIN`, e um novo dashboard no frontend (nova rota sob `/barber`, guard
`['dono','admin']`) que reaproveita o padrão visual de `BillingDashboard.tsx` para comparar
performance entre barbeiros. O endpoint/página de billing global existente não é alterado.

## Scope
### In Scope
- Backend: novo método `BillingController.getSummaryByBarber` + nova rota
  `GET /billing/summary/by-barber` (`authMiddleware` + `requireRole('DONO', 'ADMIN')`).
- Backend: agregação por `adminId` reutilizando `AppointmentService.listBookableBarbers()` para
  garantir que barbeiros sem nenhum atendimento `COMPLETED` apareçam com métricas zeradas.
- Backend: tratamento de agendamentos `COMPLETED` sem `adminId` (bucket "Sem profissional
  atribuído") e de agendamentos atribuídos a um `adminId` de papel não-`BARBEIRO` (`DONO`/`ADMIN`
  tecnicamente podem ser `admin` de um `Appointment` hoje — ver `appointmentService.ts:196-200`),
  para que a soma dos grupos sempre reconcilie com o total global (paridade com `getSummary`).
- Frontend: nova rota `/barber/metricas` (`layout.tsx` com `ProtectedRoute
  allowedUserType={['dono', 'admin']}`, `page.tsx`, componente `MetricasDashboard.tsx`, hook
  dedicado `useBarberMetrics.tsx`, módulo scss próprio inspirado em `Billing.module.scss`).
- Frontend: novo link "Métricas" no `BarberHeader.tsx`, visível só para `dono`/`admin` (mesmo
  padrão condicional dos links "Configurações"/"Usuários").

### Out of Scope
- Alterar `BillingController.getSummary` (rota `/billing/summary`) ou `BillingDashboard.tsx`
  (`/barber/billing`) — continuam exatamente como estão, usados por qualquer staff logado.
- Filtro de período (data inicial/final) na agregação — replica o mesmo escopo temporal do
  endpoint global existente (todos os `COMPLETED` históricos).
- Gráficos/biblioteca de charts — mantém o padrão visual atual (cards + tabela HTML).
- Exportação de relatórios, métricas de ocupação/agenda.
- Qualquer alteração de `prisma/schema.prisma` — todos os dados necessários já existem
  (`Appointment.adminId`, `Appointment.status`, `Service.price`, `User.role`).

## Current State (from codebase)
- `barbearia-backend/src/controllers/billing.controller.ts` — `BillingController.getSummary`
  busca todos `Appointment{status:COMPLETED}` com `include:{service:true}`, soma `service.price`
  para `totalRevenue`, calcula `averageTicket`, agrupa por **nome do serviço** em
  `servicesBreakdown`. Não agrupa por `adminId`.
- `barbearia-backend/src/routes/index.ts:29` — única rota de billing hoje:
  `router.get('/billing/summary', authMiddleware, requireRole('BARBEIRO','DONO','ADMIN'),
  billingController.getSummary)`. Não existe `billing.routes.ts` dedicado — rota declarada inline.
- `barbearia-backend/src/services/appointmentService.ts:107-113` — `listBookableBarbers()` já
  lista `User{role:'BARBEIRO'}` (`select: {id, name}`, `orderBy: name asc`).
- `barbearia-backend/src/services/appointmentService.ts:196-200` — `createAppointment` só rejeita
  `adminId` de usuário com `role === 'CLIENTE'`; ou seja, `Appointment.admin` pode teoricamente ser
  `DONO`/`ADMIN`, não só `BARBEIRO`.
- `barbearia-backend/prisma/schema.prisma` — `Appointment.adminId` é `Int?` (opcional); não existe
  `NOT NULL` garantindo barbeiro sempre atribuído.
- `barbearia-shelby-frontend/src/app/barber/billing/BillingDashboard.tsx` +
  `Billing.module.scss` — padrão visual de referência (3 cards de métrica + tabela de breakdown),
  tokens de cor: `$card-bg:#1e1e1e; $border-color:#3a3a3a; $text-color:#f0f0f0;
  $text-muted:#a0a0a0; $brand-color:#f67366;`.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx` e
  `.../usuarios/layout.tsx` — padrão de guard aninhado:
  `<ProtectedRoute allowedUserType={['dono', 'admin']}>{children}</ProtectedRoute>`.
- `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` — padrão de hook dedicado (state +
  `api.get` com header `Authorization: Bearer <token>` de `useAuth().token` + `loading`/`error`) a
  replicar para o novo hook de métricas.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx:51-60` —
  local dos links condicionais `dono`/`admin` já existentes (`Configurações`, `Usuários`).
- `barbearia-shelby-frontend/src/context/AuthContext.tsx:7` — `UserType` é minúsculo
  (`'cliente'|'barbeiro'|'dono'|'admin'`), diferente do enum `UserRole` do Prisma (maiúsculo).

## Desired End State
- Dono ou admin logado, ao acessar `/barber/metricas`, vê: (1) cards com os totais gerais
  (faturamento total, atendimentos concluídos totais, ticket médio geral — devem bater
  exatamente com os valores hoje exibidos em `/barber/billing`, confirmando paridade), e (2) uma
  tabela com uma linha por barbeiro (`nome`, atendimentos concluídos, faturamento, ticket médio),
  incluindo barbeiros com zero atendimentos, ordenada por faturamento decrescente.
- Um novo link "Métricas" aparece no `BarberHeader` apenas para `dono`/`admin`.
- Barbeiro logado, cliente logado e visitante não conseguem acessar `/barber/metricas`
  (redirecionados para `/Login` pelo guard de rota) nem `GET /billing/summary/by-barber`
  (401 sem token, 403 com token de papel não autorizado).
- `/barber/billing` e `GET /billing/summary` continuam funcionando sem nenhuma mudança de
  comportamento.
- As 7 rotas públicas da regra transversal do roadmap (`/`, `/Servicos`, `/Login`, `/CriarConta`,
  `/EsqueciSenha`, `/agendamento`, `/meus-servicos`) continuam acessíveis a visitante/cliente sem
  mudança.

## References
- PRD: `barbearia-backend/SDD/PRD/2026-07-30-dashboard-metricas-por-barbeiro.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-07-30-dashboard-metricas-por-barbeiro.md`
- Key code references:
  - `barbearia-backend/src/controllers/billing.controller.ts` — controller a estender.
  - `barbearia-backend/src/routes/index.ts:29` — onde a nova rota é declarada.
  - `barbearia-backend/src/services/appointmentService.ts:107` — `listBookableBarbers()` a
    reutilizar.
  - `barbearia-shelby-frontend/src/app/barber/billing/BillingDashboard.tsx` — padrão visual base.
  - `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx` — padrão de guard a
    replicar.
  - `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` —
    onde adicionar o novo link.

---

## Phase 1: Backend — endpoint agregado por barbeiro

### Tasks
- [x] Em `barbearia-backend/src/controllers/billing.controller.ts`, adicionar o método
      `getSummaryByBarber(req, res)` na classe `BillingController`:
      - Buscar todos `Appointment{status:'COMPLETED'}` com `include:{service:true, admin:{select:
        {id:true, name:true, role:true}}}`.
      - Buscar todos os barbeiros via `new AppointmentService().listBookableBarbers()` (reuso) para
        semear o mapa de agregação com entradas zeradas (`totalRevenue:0, totalAppointments:0,
        averageTicket:0, role:'BARBEIRO'`).
      - Agregar por chave `appointment.adminId ?? 'unassigned'`: se a chave não existe no mapa
        ainda, criar entrada com `name: appointment.admin?.name ?? 'Sem profissional atribuído'`,
        `role: appointment.admin?.role ?? null`, `adminId: appointment.adminId ?? null`.
        Incrementar `totalAppointments` e somar `service.price` em `totalRevenue` para a chave.
      - Calcular `averageTicket` por entrada (`totalRevenue / totalAppointments`, `0` se
        `totalAppointments === 0`).
      - Ordenar o array resultante por `totalRevenue` desc (empate: `name` asc).
      - Calcular `overall` (mesma fórmula de `getSummary`: soma de todos os `COMPLETED`) para os
        cards de topo — deve reconciliar com a soma dos grupos por barbeiro.
      - Responder `200` com `{ overall: {totalRevenue, totalAppointments, averageTicket},
        barbers: [...] }`. Tratar lista vazia (nenhum `COMPLETED`) retornando `overall` zerado e
        `barbers` com os barbeiros existentes zerados (sem bucket "Sem profissional atribuído").
      - `try/catch` com log + `500` no erro, seguindo o padrão de `getSummary`.
- [x] Em `barbearia-backend/src/routes/index.ts`, adicionar a rota:
      `router.get('/billing/summary/by-barber', authMiddleware, requireRole('DONO', 'ADMIN'),
      billingController.getSummaryByBarber);` logo após a rota existente de `/billing/summary`
      (linha 29), sem alterar a rota existente.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros de TypeScript.
- [x] Validação funcional via API real (script/cURL, sessão local com `npm run dev`): `DONO` e
      `ADMIN` recebem `200` em `GET /billing/summary/by-barber` com o shape esperado; `BARBEIRO`
      recebe `403`; sem token recebe `401`.
- [x] Conferir que `overall.totalRevenue`/`totalAppointments`/`averageTicket` do novo endpoint
      batem exatamente com os valores retornados por `GET /billing/summary` no mesmo estado do
      banco (paridade/regressão).

#### Manual Verification
- [x] Criar (ou usar dado de seed) ao menos um agendamento `COMPLETED` para 2 barbeiros distintos
      e confirmar visualmente no retorno da API que cada barbeiro aparece com seus próprios
      números, e que um terceiro barbeiro sem atendimento aparece zerado.

---

## Phase 2: Frontend — hook, página e navegação

### Tasks
- [x] Criar `barbearia-shelby-frontend/src/hooks/useBarberMetrics.tsx`, seguindo o padrão de
      `useBusinessSettings.tsx`: estado `overall`/`barbers`/`loading`/`error`, `getHeaders()` via
      `useAuth().token`, `fetchAll()` chamando `api.get('/billing/summary/by-barber', {headers})`
      no mount (`useEffect`), retorno `{ overall, barbers, loading, error, refetch }`.
- [x] Criar `barbearia-shelby-frontend/src/app/barber/metricas/layout.tsx`:
      `<ProtectedRoute allowedUserType={['dono', 'admin']}>{children}</ProtectedRoute>` (mesmo
      padrão de `configuracoes/layout.tsx`).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/metricas/MetricasDashboard.tsx`: componente
      `'use client'` usando `useBarberMetrics`, renderizando cards de topo (faturamento total,
      atendimentos totais, ticket médio geral — reaproveitando a estrutura de
      `BillingDashboard.tsx`) e uma tabela com colunas Barbeiro / Atendimentos / Faturamento /
      Ticket Médio, uma linha por item de `barbers` (formatação `R$ X.XX` via `.toFixed(2)`, igual
      ao padrão já usado em `BillingDashboard.tsx`).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/metricas/page.tsx`: `main` renderizando
      `<MetricasDashboard />`, seguindo o padrão de `barber/billing/page.tsx`.
- [x] Criar `barbearia-shelby-frontend/src/app/barber/metricas/Metricas.module.scss`, baseado em
      `Billing.module.scss` (mesmos tokens de cor), com classe extra para a coluna de nome do
      barbeiro se necessário.
- [x] Em `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`,
      adicionar um novo `<Link href="/barber/metricas">` com botão "Métricas", visível só quando
      `auth.user?.userType === 'dono' || auth.user?.userType === 'admin'` (mesma condição já usada
      para os links de "Configurações" e "Usuários", inserido ao lado deles).

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-shelby-frontend && npm run build` — build de produção limpo.
- [x] `npx eslint src` — limpo (equivalente ao `npm run lint`, que está quebrado no Next 16
      independentemente desta mudança, achado já documentado nos epics anteriores).
- [x] `npm test` — sem suítes Jest relevantes no projeto hoje (esperado "No tests found", mesmo
      comportamento dos epics anteriores).

#### Manual Verification
- [x] E2E via navegador real: login como `dono`, acessar `/barber/metricas` via link no header,
      confirmar cards + tabela com dados corretos por barbeiro.
- [x] Repetir como `admin`.
- [x] Login como `barbeiro`: confirmar que o link "Métricas" não aparece no header e que acessar
      `/barber/metricas` diretamente pela URL redireciona para `/Login`.
- [x] Sem login (visitante): acessar `/barber/metricas` diretamente redireciona para `/Login`.
- [x] Confirmar que `/barber/billing` continua idêntico (sem regressão).
- [x] Confirmar a regra transversal: `/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`,
      `/agendamento` retornam 200 para visitante; `/meus-servicos` mantém o comportamento
      pré-existente (redirect para `/Login` se não logado).

---

## Testing Notes
- Unit tests: não há suíte Jest/pytest cobrindo `billing.controller.ts` hoje; nenhuma nova suíte
  automatizada é criada por este plan (consistente com o estado atual do projeto, sem regressão de
  cobertura).
- Integration tests: validação via chamadas HTTP reais (cURL/script Node) contra o backend local,
  cobrindo os 4 papéis (dono, admin, barbeiro, sem token).
- Manual steps: 1) subir backend (`npm run dev`) e frontend (`npm run dev`); 2) logar como cada
  papel via `/Login`; 3) navegar/testar conforme os itens de Manual Verification acima.

## Migration Notes
Não aplicável — este epic não altera `prisma/schema.prisma`. Todos os dados necessários
(`Appointment.adminId`, `Appointment.status`, `Service.price`, `User.role`) já existem. Nenhuma
migration Prisma é executada por este plan.

## Rollout Notes
- Nenhuma flag de feature necessária — mudança é aditiva (novo endpoint, nova rota de frontend,
  novo link condicional por role já existente). Sem impacto em usuários não autorizados.

---
