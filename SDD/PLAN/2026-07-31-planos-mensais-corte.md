PLAN PATH: barbearia-backend/SDD/PLAN/2026-07-31-planos-mensais-corte.md

# Planos mensais de corte configuráveis pelo dono, com assinatura e consumo por ciclo pelo cliente — Implementation Plan

## Overview
Hoje não existe nenhum conceito de plano/assinatura no codebase: todo agendamento é "avulso". Vamos
adicionar duas tabelas (`Plan`, catálogo cadastrado pelo dono; `ClientSubscription`, a assinatura de
um cliente a um plano, com contador de cortes usados no ciclo vigente), um campo opcional em
`Appointment` (`subscriptionId`) para rastrear qual assinatura pagou um agendamento, um CRUD de
planos (leitura pública dos ativos, escrita `DONO`/`ADMIN`) e um conjunto de rotas de assinatura
(`CLIENTE`-only: assinar, ver a própria assinatura, cancelar). O consumo de 1 corte por agendamento
é integrado dentro da mesma transação que já existe em `AppointmentService.createAppointment` (que
já re-checa disponibilidade antes de gravar), via um payload opcional `usePlan?: boolean`. No
frontend: uma página `/barber/planos` (DONO/ADMIN, clonada do padrão de `/barber/usuarios`), uma
nova seção "Meu Plano" dentro de `/meus-servicos` (assinar/ver ciclo/cancelar) e um toggle "Usar meu
plano" no passo de confirmação do wizard `/agendamento`.

Decisões de escopo fechadas no PRD (sem Open Questions): esgotar os cortes do ciclo bloqueia só o
*uso do plano* naquele agendamento específico — o cliente pode reenviar sem o plano e pagar avulso
normalmente, o fluxo de agendamento em si nunca fica bloqueado; o ciclo mensal reinicia na data de
assinatura (não no dia 1), calculado sob demanda com `addMonths` (date-fns), sem cron/job; o dono
nunca assina em nome do cliente — só cadastra planos, os endpoints de assinatura são
`requireRole('CLIENTE')`; não há gateway de pagamento neste epic (assinatura é só registro interno,
sem cobrança); "desativar" um plano usa um campo `active` (mesmo padrão de `User.active`, Epic 4),
sem hard delete; 1 corte do plano cobre qualquer serviço do catálogo (não há segmentação por tipo de
serviço no texto do épico); só uma assinatura `ACTIVE` por cliente por vez; não há página pública de
catálogo de planos — planos só aparecem em `/barber/planos` (gestão) e dentro de `/meus-servicos`
(cliente logado).

## Scope
### In Scope
- `prisma/schema.prisma`: `enum SubscriptionStatus`, `model Plan`, `model ClientSubscription`,
  `Appointment.subscriptionId` (+ relação), `User.subscriptions` (relação inversa). Migration
  aditiva.
- Backend novo: `src/utils/subscriptionCycle.ts` (cálculo puro do ciclo vigente),
  `src/services/planService.ts`, `src/controllers/plan.controller.ts`, `src/routes/plan.routes.ts`
  (montada em `/api/plans`), `src/services/subscriptionService.ts`,
  `src/controllers/subscription.controller.ts`, `src/routes/subscription.routes.ts` (montada em
  `/api/subscriptions`).
- Backend alterado: `src/services/appointmentService.ts` (`CreateAppointmentPayload.usePlan`,
  consumo de plano dentro da transação existente, `select`/`include` de `listAll`/`findById` passam
  a trazer `subscription.plan.name`), `src/controllers/appointment.controller.ts::create` (extrai
  `usePlan` do body), `src/routes/index.ts` (monta `/plans` e `/subscriptions`).
- Frontend novo: `src/hooks/usePlans.tsx`, `src/app/barber/planos/{layout.tsx,page.tsx,
  PlanFormModal.tsx,Planos.module.scss}`, `src/hooks/useSubscription.tsx`,
  `src/app/meus-servicos/components/{MySubscription.tsx,MySubscription.module.scss}`.
- Frontend alterado: `src/app/barber/components/BarberDashboard/BarberHeader.tsx` (link "Planos"),
  `src/app/meus-servicos/components/ClientDashboard.tsx` (renderiza `MySubscription`),
  `src/hooks/useClientData.tsx` (tipo `Appointment.subscription`),
  `src/app/meus-servicos/components/ClientAppointmentCard.tsx` (mostra plano usado, se houver),
  `src/app/agendamento/page.tsx` (toggle "Usar meu plano" no passo 4),
  `src/app/agendamento/agendamento-moderno.module.scss` (classe do toggle).

### Out of Scope
- Qualquer gateway de pagamento/cobrança automatizada — assinatura é só registro interno.
- Dono criar/atribuir assinatura em nome de um cliente — não existe essa ação em nenhuma camada.
- Página pública de catálogo de planos para visitante não-logado.
- Múltiplas assinaturas `ACTIVE` simultâneas por cliente.
- Mudanças em `BillingController`/dashboards de faturamento (Epic 6) para refletir plano.
- Renovação automática, notificação de fim de ciclo, upgrade/downgrade proporcional de plano.
- Segmentação do crédito do plano por tipo de serviço.
- Hard delete de plano — só toggle `active`.

## Current State (from codebase)
- `barbearia-backend/prisma/schema.prisma:1-86` — sem nenhuma tabela de plano/assinatura hoje.
  Modelos existentes: `User` (15-28, com `role`/`active`), `Service` (30-37), `Appointment` (39-55),
  `Otp`, `BusinessHours`, `Holiday`.
- `barbearia-backend/src/services/appointmentService.ts:177-260` —
  `createAppointment(payload)`: valida horário/feriado, resolve `adminId`, checa disponibilidade, e
  dentro de `prisma.$transaction` (238-258) re-checa sobreposição antes de `tx.appointment.create`.
  Ponto exato de integração do consumo de plano (mesma transação, mesmo padrão "checar de novo antes
  de gravar").
- `barbearia-backend/src/controllers/appointment.controller.ts:8-58` — `create` extrai o body bruto
  e repassa ao service; precisa extrair `usePlan` também.
- `barbearia-backend/src/services/appointmentService.ts:135-168` (`listAll`) e `170-175`
  (`findById`) — `select`/`include` atuais não trazem nada de assinatura; precisam incluir
  `subscription: { plan: { name } }` para exibição no frontend.
- `barbearia-backend/src/services/userService.ts` — precedente de `active: Boolean` + toggle via
  `update`, sem hard delete (mesmo padrão a aplicar em `Plan`).
- `barbearia-backend/src/services/serviceService.ts` + `src/routes/service.routes.ts` — precedente
  de leitura pública / escrita restrita a papel (aqui, `DONO`/`ADMIN`, não `BARBEIRO`).
- `barbearia-backend/src/routes/user.routes.ts` — precedente de rota 100% restrita por papel
  (`DONO`/`ADMIN`).
- `barbearia-backend/src/routes/index.ts:1-32` — monta cada área sob `/api/<área>`; precisa de duas
  entradas novas.
- `barbearia-backend/package.json` — `date-fns: ^4.1.0` já é dependência direta, já importado em
  `appointmentService.ts` (`format`, `ptBR`); `addMonths` está disponível sem nova instalação.
- `barbearia-shelby-frontend/src/app/barber/usuarios/*` (Epic 4/5) — precedente completo (listagem +
  modal + toggle `active` + `ConfirmationModal`, guard `['dono','admin']`) a clonar para
  `barber/planos/*`.
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx:386-407` (step 4) — local do novo toggle,
  antes de `AgendamentoForm`; `handleBookingSubmit` (205-284) monta o payload de
  `POST /appointments`.
- `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientDashboard.tsx` — dashboard do
  cliente (`useClientData`), sem nenhuma seção de plano hoje; novo componente `MySubscription` será
  renderizado no topo, antes de "Próximos Agendamentos".
- `barbearia-shelby-frontend/src/hooks/useClientData.tsx:7-15` — tipo `Appointment` sem campo
  `subscription`.
- `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientAppointmentCard.tsx:46-50`
  (`cardBody`) — local de exibição de "pago com plano X", reaproveitando os estilos `p`/`strong` já
  existentes em `ClientAppointmentCard.module.scss` (sem CSS novo necessário).
- `barbearia-shelby-frontend/tsconfig.json` — alias `@/*` → `./src/*`, confirmado.
- Não há testes automatizados (`*.test.ts`/`*.spec.ts`/`*.cy.*`) cobrindo agendamento/planos em
  nenhum dos dois repos.

## Desired End State
- Dono/admin autenticado acessa `/barber/planos`, cadastra/edita/ativa/desativa planos (nome, cortes
  por ciclo, preço, benefícios).
- Cliente logado vê, dentro de `/meus-servicos`, uma seção "Meu Plano": se não tem assinatura, lista
  de planos ativos com botão "Assinar"; se tem, vê cortes restantes/ciclo atual e pode cancelar.
- No wizard `/agendamento`, cliente logado com assinatura ativa e cortes disponíveis vê um toggle
  "Usar meu plano" no passo de confirmação; ao confirmar marcado, o agendamento é criado vinculado à
  assinatura e o contador do ciclo é incrementado atomicamente; sem cortes disponíveis (ou toggle
  desmarcado), agendamento segue exatamente como hoje (avulso).
- Ciclo mensal reinicia na data de assinatura (verificável via `GET /subscriptions/me`).
- Convidado e staff continuam agendando sem nenhuma mudança de comportamento.
- Verificação: `npm run build` limpo nos dois repos; `npx eslint src` limpo no frontend; walkthrough
  manual no navegador + chamadas reais à API (cadastro de plano, assinatura, consumo de corte via
  agendamento, esgotamento do ciclo, cancelamento).

## References
- PRD: `barbearia-backend/SDD/PRD/2026-07-31-planos-mensais-corte.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-07-31-planos-mensais-corte.md`
- Key code references:
  - `barbearia-backend/prisma/schema.prisma:1-86`
  - `barbearia-backend/src/services/appointmentService.ts:177-260`
  - `barbearia-backend/src/routes/index.ts:1-32`
  - `barbearia-backend/src/services/userService.ts`, `src/services/serviceService.ts`
  - `barbearia-shelby-frontend/src/app/barber/usuarios/*`
  - `barbearia-shelby-frontend/src/app/agendamento/page.tsx:386-407`
  - `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientDashboard.tsx`

---

## Phase 1: Schema — `Plan`, `ClientSubscription`, `Appointment.subscriptionId`
### Tasks
- [ ] Adicionar `enum SubscriptionStatus { ACTIVE CANCELLED }`, `model Plan` e
      `model ClientSubscription` a `barbearia-backend/prisma/schema.prisma` (ver Spec para o bloco
      exato).
- [ ] Adicionar `subscriptions ClientSubscription[] @relation("ClientSubscriptions")` a `model User`.
- [ ] Adicionar `subscriptionId Int?` + `subscription ClientSubscription? @relation(...)` a
      `model Appointment`.
- [ ] Rodar `npx prisma migrate dev --name add_plans_and_subscriptions` dentro de
      `barbearia-backend/`.
- [ ] Revisar o SQL gerado em `prisma/migrations/<timestamp>_add_plans_and_subscriptions/migration.sql`:
      confirmar que é só `CREATE TYPE`, `CREATE TABLE` (x2), `ALTER TABLE "Appointment" ADD COLUMN
      "subscriptionId"` + `ADD CONSTRAINT` (FKs), sem `DROP`/`RENAME`/`NOT NULL` sem default em
      coluna existente com dados.

### Success Criteria
#### Automated Verification
- [ ] `cd barbearia-backend && npx prisma migrate dev --name add_plans_and_subscriptions` — aplica
      sem erro.
- [ ] `cd barbearia-backend && npx prisma generate` — Prisma Client regenerado sem erro (`prisma.plan`,
      `prisma.clientSubscription` disponíveis nos tipos).
- [ ] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [ ] Inspecionar o `migration.sql` gerado (leitura direta) e confirmar que é 100% aditivo (sem
      `DROP`/`ALTER` destrutivo em tabela existente com dados).
- [ ] Confirmar (via Prisma Studio ou query pontual) que agendamentos existentes continuam com
      `subscriptionId: null` após a migration, sem nenhuma regressão de leitura.

---

## Phase 2: Backend — catálogo de planos (`/api/plans`)
### Tasks
- [ ] Criar `barbearia-backend/src/services/planService.ts` (`listActive`, `listAll`, `findById`,
      `create`, `update`), com validação de `cutsPerCycle` (inteiro > 0) e `price` (>= 0).
- [ ] Criar `barbearia-backend/src/controllers/plan.controller.ts` (`listActive`, `listAll`,
      `getById`, `create`, `update`).
- [ ] Criar `barbearia-backend/src/routes/plan.routes.ts` (`GET /` público;
      `GET /all`, `POST /`, `PUT /:id` restritos a `authMiddleware` + `requireRole('DONO','ADMIN')`;
      `GET /:id` público — rota `/all` declarada **antes** de `/:id`, para não ser capturada por ela).
- [ ] Montar a rota em `barbearia-backend/src/routes/index.ts` (`/plans`).

### Success Criteria
#### Automated Verification
- [ ] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [ ] Sem token: `GET /api/plans` retorna 200 com array (vazio ou só planos `active:true`).
- [ ] Com token `DONO`: `POST /api/plans` com `{name,cutsPerCycle,price}` retorna 201;
      `cutsPerCycle: 0` ou negativo retorna 400; `GET /api/plans/all` retorna todos (inclusive
      inativos, se houver); `PUT /api/plans/:id` com `{active:false}` desativa e o plano some de
      `GET /api/plans` mas continua em `GET /api/plans/all`. Confirmado via curl real.
- [ ] Sem token ou com token de `barbeiro`/`cliente`: `POST /api/plans`, `GET /api/plans/all` e
      `PUT /api/plans/:id` retornam 401/403. Confirmado via curl real.

---

## Phase 3: Backend — assinatura (`/api/subscriptions`)
### Tasks
- [ ] Criar `barbearia-backend/src/utils/subscriptionCycle.ts`
      (`resolveCurrentCycle(lastKnownCycleStart, cutsUsedInLastKnownCycle, now?)`, usando `addMonths`
      de `date-fns`, função pura sem I/O).
- [ ] Criar `barbearia-backend/src/services/subscriptionService.ts` (`subscribe(clientId, planId)`,
      `getMine(clientId)`, `cancelMine(clientId)`), reutilizando `resolveCurrentCycle`.
- [ ] Criar `barbearia-backend/src/controllers/subscription.controller.ts` (`subscribe`, `getMine`,
      `cancelMine`).
- [ ] Criar `barbearia-backend/src/routes/subscription.routes.ts` (todas as rotas
      `authMiddleware` + `requireRole('CLIENTE')`).
- [ ] Montar a rota em `barbearia-backend/src/routes/index.ts` (`/subscriptions`).

### Success Criteria
#### Automated Verification
- [ ] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [ ] Com token de `CLIENTE` de teste e um plano ativo cadastrado (Phase 2): `POST /api/subscriptions`
      com `{planId}` retorna 201 com `cutsRemaining` igual a `cutsPerCycle` do plano;
      `GET /api/subscriptions/me` retorna a mesma assinatura; nova tentativa de
      `POST /api/subscriptions` (mesmo cliente) retorna 409.
- [ ] `PATCH /api/subscriptions/me/cancel` retorna 204; `GET /api/subscriptions/me` volta a retornar
      `null`; nova tentativa de `PATCH .../cancel` retorna 404 (sem assinatura ativa).
- [ ] Com token de `barbeiro`/`dono`/`admin`, ou sem token: as três rotas retornam 401/403.
      Confirmado via curl real.

---

## Phase 4: Backend — consumo de plano na criação de agendamento
### Tasks
- [ ] `barbearia-backend/src/services/appointmentService.ts`: importar `resolveCurrentCycle`;
      adicionar `usePlan?: boolean` a `CreateAppointmentPayload`; dentro da transação existente
      (após a re-checagem de sobreposição, antes do `create`), se `usePlan` truthy, buscar a
      assinatura `ACTIVE` do `clientId` (com `plan`), resolver o ciclo vigente, validar cortes
      disponíveis (400 se não houver assinatura/plano inativo/sem cortes), incrementar
      `cutsUsedInCycle`/atualizar `currentCycleStart` e conectar `subscription` no `create`.
- [ ] `listAll`/`findById` do mesmo service: incluir `subscription: { select: { id, plan: { select:
      { id, name } } } }` no `select`/`include`.
- [ ] `barbearia-backend/src/controllers/appointment.controller.ts::create`: extrair `usePlan` do
      body (`req.body.usePlan === true`) e repassar ao service.

### Success Criteria
#### Automated Verification
- [ ] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [ ] Cliente de teste com assinatura ativa (`cutsRemaining > 0`): `POST /api/appointments` com
      `usePlan: true` (mais os campos já exigidos) retorna 201; `GET /api/subscriptions/me` do mesmo
      cliente mostra `cutsUsed` incrementado em 1; o agendamento criado, consultado via
      `GET /api/appointments/:id`, traz `subscription.plan.name`.
- [ ] Repetindo o consumo até `cutsRemaining` chegar a 0: a próxima tentativa com `usePlan: true`
      retorna 400 (mensagem clara); a mesma requisição **sem** `usePlan` (ou `usePlan: false`) cria o
      agendamento normalmente (avulso), sem nenhum bloqueio.
- [ ] Agendamento de convidado (sem `clientId`) com `usePlan: true` retorna 400 (plano exige login).
- [ ] Regressão: `POST /api/appointments` sem `usePlan` no body continua funcionando exatamente como
      antes (staff e convidado, fluxos já cobertos pelos Epics 1/2/3).

---

## Phase 5: Frontend — gestão de planos (`/barber/planos`, DONO/ADMIN)
### Tasks
- [ ] Criar `barbearia-shelby-frontend/src/hooks/usePlans.tsx` (mesmo padrão de `useUsers.tsx`:
      `fetchAll` via `GET /plans/all`, `createPlan`, `updatePlan`, `toggleActive`).
- [ ] Criar `barbearia-shelby-frontend/src/app/barber/planos/layout.tsx` (`ProtectedRoute
      allowedUserType={['dono','admin']}`, mesmo padrão de `barber/usuarios/layout.tsx`).
- [ ] Criar `barbearia-shelby-frontend/src/app/barber/planos/PlanFormModal.tsx` (form
      nome/descrição/cortes por ciclo/preço/benefícios).
- [ ] Criar `barbearia-shelby-frontend/src/app/barber/planos/page.tsx` (listagem + criar + editar +
      ativar/desativar com `ConfirmationModal`).
- [ ] Criar `barbearia-shelby-frontend/src/app/barber/planos/Planos.module.scss` (mesmos tokens de
      `Usuarios.module.scss`).
- [ ] Atualizar `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`:
      link "Planos" (`/barber/planos`), condicionado a `dono`/`admin`, ao lado de "Usuários".

### Success Criteria
#### Automated Verification
- [ ] `cd barbearia-shelby-frontend && npm run build` — build sem erros; rota `/barber/planos`
      gerada.
- [ ] `cd barbearia-shelby-frontend && npx eslint src` — sem erros.

#### Manual Verification
- [ ] Logado como `dono`: `/barber/planos` carrega, criar/editar/desativar/reativar plano funciona
      no navegador.
- [ ] Logado como `admin`: mesmo acesso funciona.
- [ ] Logado como `barbeiro`/`cliente`, ou deslogado: `/barber/planos` redireciona; link "Planos" não
      aparece no header desses papéis.

---

## Phase 6: Frontend — "Meu Plano" em `/meus-servicos`
### Tasks
- [ ] Criar `barbearia-shelby-frontend/src/hooks/useSubscription.tsx` (busca `GET /subscriptions/me`
      + `GET /plans` em paralelo, só quando `auth.user.userType === 'cliente'`; `subscribe(planId)`;
      `cancelSubscription()`).
- [ ] Criar `barbearia-shelby-frontend/src/app/meus-servicos/components/MySubscription.tsx`
      (mostra assinatura atual com cortes restantes/fim do ciclo + botão cancelar, **ou** lista de
      planos disponíveis com botão assinar; reaproveita `ConfirmationModal` para confirmar
      cancelamento).
- [ ] Criar `barbearia-shelby-frontend/src/app/meus-servicos/components/MySubscription.module.scss`.
- [ ] Atualizar `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientDashboard.tsx`:
      renderizar `<MySubscription />` antes da seção "Próximos Agendamentos".
- [ ] Atualizar `barbearia-shelby-frontend/src/hooks/useClientData.tsx`: tipo `Appointment` ganha
      `subscription?: { id: number; plan: { id: number; name: string } } | null`.
- [ ] Atualizar `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientAppointmentCard.tsx`:
      exibir "Pago com plano: {nome}" dentro de `cardBody` quando `appointment.subscription` existir
      (reaproveitando estilos `p`/`strong` já existentes, sem CSS novo).

### Success Criteria
#### Automated Verification
- [ ] `cd barbearia-shelby-frontend && npm run build` — sem erros.
- [ ] `cd barbearia-shelby-frontend && npx eslint src` — sem erros.

#### Manual Verification
- [ ] Cliente de teste sem assinatura: `/meus-servicos` mostra planos disponíveis com botão
      "Assinar"; assinar funciona e a seção passa a mostrar o plano atual com cortes
      restantes/ciclo.
- [ ] Cliente com assinatura ativa: cancelar funciona (com confirmação) e a seção volta a mostrar a
      lista de planos disponíveis.
- [ ] Agendamento consumido via plano (Phase 4/7) aparece no histórico de "Meus Agendamentos" com a
      indicação "Pago com plano: {nome}".

---

## Phase 7: Frontend — toggle "Usar meu plano" no wizard `/agendamento`
### Tasks
- [ ] `barbearia-shelby-frontend/src/app/agendamento/page.tsx`: usar `useSubscription()` para obter
      `subscription`; adicionar estado `usePlanToggle` (default `true`); no passo 4 (antes de
      `AgendamentoForm`), renderizar o toggle apenas quando `subscription && subscription.cutsRemaining
      > 0` (checkbox com texto "Usar meu plano (`N` cortes restantes)"); incluir `usePlan: true` no
      payload de `POST /appointments` somente no ramo de cliente logado não-staff, quando aplicável;
      tipo `BookingPayload` local ganha `usePlan?: boolean`.
- [ ] `barbearia-shelby-frontend/src/app/agendamento/agendamento-moderno.module.scss`: classe nova
      `.planToggle` (layout simples do checkbox + label).

### Success Criteria
#### Automated Verification
- [ ] `cd barbearia-shelby-frontend && npm run build` — sem erros.
- [ ] `cd barbearia-shelby-frontend && npx eslint src` — sem erros.

#### Manual Verification
- [ ] Cliente logado com assinatura ativa e cortes disponíveis: toggle aparece marcado por padrão no
      passo de confirmação; agendar com o toggle marcado consome 1 corte (confirmado via
      `/meus-servicos` ou `GET /subscriptions/me`); desmarcado, agenda avulso normalmente (sem
      consumo).
- [ ] Cliente logado sem assinatura (ou com 0 cortes restantes): toggle não aparece; fluxo idêntico
      ao anterior à mudança.
- [ ] Convidado (sem login) e staff logado (barbeiro/dono/admin): fluxo de agendamento idêntico ao
      anterior à mudança, toggle nunca aparece.
- [ ] Regra transversal do `ROADMAP_V2.md`: `/`, `/Servicos`, `/Login`, `/CriarConta`,
      `/EsqueciSenha`, `/agendamento`, `/meus-servicos` continuam acessíveis (200) para visitante,
      sem nenhuma restrição nova.

---

## Testing Notes
- Unit tests: não há suíte de testes de backend hoje — não introduzida por este plano (fora de
  escopo, mesmo padrão dos épicos anteriores).
- Integration tests: idem.
- Manual steps: 1) `npx prisma migrate dev` no backend; 2) `npm run dev` no backend; 3) `npm run dev`
  no frontend; 4) login como `dono` (seed: `admin@barbearia.com`) para cadastrar um plano de teste em
  `/barber/planos`; 5) criar/usar um usuário `CLIENTE` de teste para assinar o plano, consumir cortes
  via `/agendamento` até esgotar, confirmar bloqueio do toggle/uso do plano e fallback para avulso,
  cancelar a assinatura; 6) limpar dados de teste (plano/assinatura/agendamentos) ao final, se
  criados diretamente no banco para acelerar a virada de ciclo.

## Migration Notes
- Projeto usa **Prisma 7**. Fluxo: (1) editar `prisma/schema.prisma`; (2) `npx prisma migrate dev
  --name add_plans_and_subscriptions`; (3) revisar o SQL gerado — deve conter só `CREATE TYPE`,
  `CREATE TABLE` (`Plan`, `ClientSubscription`), `ALTER TABLE "Appointment" ADD COLUMN
  "subscriptionId"` + `ADD CONSTRAINT` (FKs), sem `DROP`/`RENAME`; (4) commitar `schema.prisma` + a
  nova pasta em `migrations/` juntos.
- Tabelas novas + coluna opcional nova (`subscriptionId Int?`, sem `NOT NULL`) — 100% aditivo,
  permitido pelas regras de expand/contract do `barbearia-backend/CLAUDE.md`. Se o script gerado
  contiver qualquer `DROP`/`ALTER` destrutivo inesperado, a execução deste plano deve parar e
  reportar antes de aplicar.
- Em produção, `npm run migrate` (`prisma migrate deploy`) roda no pipeline de deploy — a nova
  migration é aplicada automaticamente.

## Rollout Notes
- Mudança de contrato de API: rotas novas e aditivas (`/api/plans*`, `/api/subscriptions*`).
  `POST /api/appointments` ganha um campo opcional `usePlan` no payload — aditivo e retrocompatível
  (omitido, comportamento idêntico ao atual). Sinalizar ao usuário (regra do `CLAUDE.md` raiz sobre
  mudanças de contrato entre os repos), ainda que nenhuma quebra de compatibilidade ocorra.
