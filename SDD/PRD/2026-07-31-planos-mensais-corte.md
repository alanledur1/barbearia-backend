# PRD — Planos mensais de corte configuráveis pelo dono, com assinatura e consumo por ciclo pelo cliente

## 1) Objetivo
- Dar ao dono uma superfície (API + página em `/barber`) para cadastrar opções de plano mensal de
  cortes (quantidade de cortes por ciclo, preço, benefícios em texto livre), habilitando/desabilitando
  cada plano sem apagar histórico de quem já assinou.
- Dar ao cliente uma forma de ver os planos disponíveis, assinar um (dentro do seu próprio perfil,
  `/meus-servicos`), acompanhar quantos cortes restam no ciclo atual e cancelar a própria assinatura.
- Permitir que, ao criar um agendamento (`/agendamento`), um cliente logado com assinatura ativa e
  cortes disponíveis no ciclo escolha pagar com o plano em vez de avulso — consumindo 1 corte do
  ciclo atômicamente na criação do agendamento.
- Hoje não existe nenhum conceito de plano/assinatura no codebase — todo agendamento é pago "avulso"
  (sem registro de forma de pagamento), confirmado por busca em `schema.prisma` e nos serviços de
  agendamento/billing (nenhuma menção a "plan"/"subscription"/"assinatura").

## 2) Escopo
**Inclui**
- Duas tabelas novas e 100% aditivas: `Plan` (catálogo de planos) e `ClientSubscription` (assinatura
  de um cliente a um plano, com estado de consumo do ciclo atual).
- Campo novo e aditivo `Appointment.subscriptionId` (opcional) — referência a qual assinatura, se
  alguma, pagou aquele agendamento (para exibir "pago com plano X" no histórico do cliente).
- Backend: CRUD de planos (`GET /plans` público — só ativos; `GET /plans/all` DONO/ADMIN — todos;
  `POST /plans` e `PUT /plans/:id` DONO/ADMIN) e assinatura (`POST /subscriptions`,
  `GET /subscriptions/me`, `PATCH /subscriptions/me/cancel` — todas `CLIENTE`-only).
- Lógica de consumo por ciclo aplicada em `AppointmentService.createAppointment`: payload aceita
  `usePlan?: boolean`; se `true` e o cliente logado tiver assinatura `ACTIVE` com cortes disponíveis
  no ciclo corrente, o agendamento é criado vinculado à assinatura e o contador do ciclo é
  incrementado — tudo dentro da mesma transação que já existe hoje (checagem de sobreposição +
  criação do agendamento). Se `usePlan=true` mas não houver cortes disponíveis (ou não houver
  assinatura ativa), a criação é rejeitada com 400 e mensagem clara — o cliente pode reenviar sem
  `usePlan` (pagamento avulso, fluxo já existente, inalterado).
- Ciclo mensal "flutuante": reinicia na data de assinatura (não no dia 1), calculado por
  `addMonths` a partir de `startDate`/`currentCycleStart`; cortes não usados não acumulam para o
  próximo ciclo.
- Frontend: nova página `/barber/planos` (DONO/ADMIN, mesmo padrão de `/barber/usuarios`) para
  cadastrar/editar/ativar/desativar planos. Nova seção "Meu Plano" dentro de `/meus-servicos`
  (cliente já logado) para ver planos disponíveis, assinar, ver cortes restantes/ciclo atual e
  cancelar. Novo toggle "Usar meu plano" no passo de confirmação (`step === 4`) de `/agendamento`,
  visível apenas quando o cliente logado tem assinatura ativa com cortes disponíveis.
- Link "Planos" no `BarberHeader`, condicionado a `dono`/`admin` (mesmo padrão de "Usuários").

**Não inclui (fora de escopo)**
- Gateway de pagamento real / cobrança automatizada — assinatura é só registro interno
  (`ClientSubscription`), sem integração com qualquer processador de pagamento (nenhum já existe no
  codebase). O "preço" do plano é apenas informativo/cadastral.
- Dono criar/atribuir assinatura em nome de um cliente — o dono só cadastra planos; assinar é uma
  ação exclusiva do próprio cliente autenticado (`requireRole('CLIENTE')` nos endpoints de
  assinatura).
- Página pública de catálogo de planos para visitante não-logado (ex.: `/Planos`) — planos ficam
  visíveis para: (a) dono/admin (gestão completa em `/barber/planos`) e (b) cliente logado (dentro
  de `/meus-servicos`, que já é uma página client-only). Consistente com o fato de "assinar"
  exigir login de qualquer forma.
- Múltiplas assinaturas simultâneas por cliente — só uma `ACTIVE` por vez; tentar assinar um novo
  plano com uma já ativa retorna 409 (precisa cancelar antes).
- Alterar `BillingController`/dashboards de faturamento (Epic 6) para refletir receita de planos —
  fora de escopo; agendamentos pagos com plano continuam contando normalmente no billing existente
  (nenhuma mudança nesse controller).
- Renovação automática/cobrança recorrente, notificação de fim de ciclo, upgrade/downgrade de plano
  com proporcionalização — fora de escopo (sem gateway de pagamento, não há o que cobrar).
- Vincular o crédito do plano a um serviço específico — 1 "corte" do plano cobre qualquer serviço do
  catálogo (`Service`), não um serviço específico por tipo/preço. Justificativa: o épico fala em
  "quantidade de cortes", não em "serviço X inteiro"; nenhuma evidência no codebase de segmentação de
  crédito por serviço.

## 3) Fluxo atual (como funciona hoje)

### Backend
- **Sem conceito de plano/assinatura**: `prisma/schema.prisma` não tem nenhuma tabela relacionada.
  Confirmado por leitura completa do arquivo (linhas 1-86) — modelos existentes: `User`, `Service`,
  `Appointment`, `Otp`, `BusinessHours`, `Holiday`.
- **Criação de agendamento**: `AppointmentService.createAppointment`
  ([appointmentService.ts:177-260](../../src/services/appointmentService.ts)) recebe
  `{ clientId?, clientData?, serviceId, requestedDateTime, adminId?, notes? }`, valida horário de
  funcionamento/feriado ([appointmentService.ts:40-82](../../src/services/appointmentService.ts)),
  resolve o barbeiro (`adminId`), checa disponibilidade (`checkAvailability`,
  [appointmentService.ts:84-104](../../src/services/appointmentService.ts)) e cria o registro dentro
  de uma transação Prisma que **re-checa** a sobreposição antes do `create`
  ([appointmentService.ts:238-258](../../src/services/appointmentService.ts)) — é o ponto exato onde
  a lógica de consumo de plano precisa entrar (mesma transação, mesmo padrão de "checar de novo antes
  de gravar" para evitar corrida). Não existe nenhum conceito de "forma de pagamento" hoje.
- **Controller de agendamento**: `AppointmentController.create`
  ([appointment.controller.ts:8-58](../../src/controllers/appointment.controller.ts)) extrai o body
  bruto (`clientId, client, serviceId, date, notes, adminId`) e repassa para o service — `usePlan`
  precisa ser extraído aqui também.
- **Padrão de CRUD "catálogo com toggle ativo"**: `UserService`
  ([userService.ts](../../src/services/userService.ts)) usa `MANAGEABLE_ROLES` fixo, `SAFE_SELECT`
  e um campo `active: Boolean @default(true)` (Epic 4) para "desativar sem apagar" — é o precedente
  mais próximo de "plano pode ser desativado sem quebrar quem já usa" (aqui, quem já assinou).
- **Padrão de CRUD "catálogo simples"**: `ServiceService`
  ([serviceService.ts](../../src/services/serviceService.ts)) — `create`/`listAll`/`findById`/
  `update`/`delete`, rotas públicas para leitura (`GET /`, `GET /:id`), staff-only para escrita
  ([service.routes.ts](../../src/routes/service.routes.ts): `requireRole('BARBEIRO','DONO','ADMIN')`).
  `Plan` seguirá o mesmo espírito de leitura pública/escrita restrita, mas restrita a
  `DONO`/`ADMIN` (não `BARBEIRO`), já que é decisão de negócio/preço, não operacional — mesmo nível
  de restrição usado em `BusinessHours`/`Holiday` (Epic 2) para escrita.
- **Padrão de rota "self" do usuário autenticado**: não há precedente direto de rota `/me` no
  backend hoje (mais próximo: `ClientController`/`AppointmentController` usam `req.user.id` para
  filtrar, não uma rota dedicada `/me`) — será o primeiro uso desse padrão, mas é convenção REST
  padrão e não introduz nenhuma biblioteca nova.
- **Middlewares reutilizáveis**: `authMiddleware`
  ([auth.middleware.ts](../../src/middlewares/auth.middleware.ts)) popula `req.user = { id, role,
  email }`; `requireRole(...roles)`
  ([requireRole.middleware.ts](../../src/middlewares/requireRole.middleware.ts)) — ambos reutilizados
  sem alteração.
- **Erros**: `CustomError(message, statusCode)`
  ([customErrors.ts](../../src/utils/customErrors.ts)) — padrão usado em todos os services recentes,
  reutilizado.
- **Rotas montadas**: `src/routes/index.ts` monta cada área sob `/api/<area>` — precisa de duas
  entradas novas (`/plans`, `/subscriptions`).
- **Data**: `date-fns` (`^4.1.0`, já em uso em `appointmentService.ts` via `format`/`ptBR`) expõe
  `addMonths`, usado para computar o ciclo mensal "flutuante" (ancorado na data de assinatura, não
  no dia 1) sem precisar de job/cron — o cálculo é feito sob demanda (lazy) tanto na leitura
  (`GET /subscriptions/me`) quanto no consumo (dentro da transação de criação de agendamento).

### Frontend
- **`/meus-servicos`**: `ClientDashboard.tsx`
  ([ClientDashboard.tsx](../../../barbearia-shelby-frontend/src/app/meus-servicos/components/ClientDashboard.tsx))
  usa `useClientData()` para listar agendamentos futuros/histórico do cliente logado (paginação
  simples, sem nenhuma seção de "plano" hoje). Layout da página
  ([meus-servicos/layout.tsx](../../../barbearia-shelby-frontend/src/app/meus-servicos/layout.tsx))
  já restringe a rota a cliente logado.
- **`/agendamento`**: `page.tsx`
  ([agendamento/page.tsx](../../../barbearia-shelby-frontend/src/app/agendamento/page.tsx)) é um
  wizard de 5 passos (Serviço → Barbeiro\* → Data/Hora → Dados/Confirmação → Sucesso; \*pulado para
  staff logado). O passo 4 (`step === 4`, linhas 386-407) já mostra um resumo
  (`<div className={styles.summary}>`) antes de `AgendamentoForm` — é o local natural para o novo
  toggle "Usar meu plano". `handleBookingSubmit` (linhas 205-284) monta o payload de
  `POST /appointments` — precisa incluir `usePlan` quando aplicável.
- **Padrão de página dono/admin-only com CRUD completo**: `/barber/usuarios`
  ([page.tsx](../../../barbearia-shelby-frontend/src/app/barber/usuarios/page.tsx),
  [UserFormModal.tsx](../../../barbearia-shelby-frontend/src/app/barber/usuarios/UserFormModal.tsx),
  [Usuarios.module.scss](../../../barbearia-shelby-frontend/src/app/barber/usuarios/Usuarios.module.scss),
  [layout.tsx](../../../barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx)) — é o
  precedente mais recente e mais completo (Epic 4/5): listagem + filtro, modal único de criar/editar,
  toggle ativo/inativo com `ConfirmationModal`, guarda `ProtectedRoute allowedUserType={['dono',
  'admin']}`, hook dedicado (`useUsers.tsx`) com `getHeaders`/`fetchAll`/`extractErrorMessage`. Será
  clonado quase 1:1 para `/barber/planos`.
- **`AuthContext`**
  ([AuthContext.tsx](../../../barbearia-shelby-frontend/src/context/AuthContext.tsx)): expõe
  `user.userType` (`'cliente'|'barbeiro'|'dono'|'admin'`), `user.id`, `token`.
- **`api.ts`**
  ([api.ts](../../../barbearia-shelby-frontend/src/services/api.ts)): client axios único, base
  `NEXT_PUBLIC_API_URL/api`.
- **`BarberHeader.tsx`**
  ([BarberHeader.tsx](../../../barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx),
  linhas 54-68): já tem o padrão exato de link condicional a `dono`/`admin` (Métricas,
  Configurações, Usuários) — o novo link "Planos" segue o mesmo bloco.

## 4) Fluxo desejado (comportamento esperado)
- Dono/admin acessa `/barber/planos`, vê a lista de planos (nome, cortes/ciclo, preço, benefícios,
  status ativo/inativo), cria um novo plano (nome, descrição opcional, cortes por ciclo, preço,
  benefícios em texto livre), edita um existente, e ativa/desativa (com confirmação) — desativar não
  apaga assinaturas existentes, só impede novas assinaturas e some da listagem pública.
- Cliente logado acessa `/meus-servicos`, vê uma nova seção "Meu Plano": se não tem assinatura ativa,
  vê a lista de planos disponíveis (ativos) com botão "Assinar"; ao assinar, a assinatura começa
  imediatamente (`status: ACTIVE`, ciclo começando agora). Se já tem assinatura ativa, vê o plano
  atual, quantos cortes já usou/restam no ciclo atual, quando o ciclo reinicia, e um botão "Cancelar
  assinatura" (com confirmação).
- Cliente tentando assinar um segundo plano enquanto já tem um ativo recebe erro claro (precisa
  cancelar o atual primeiro).
- No wizard de `/agendamento`, um cliente logado com assinatura ativa e cortes disponíveis no ciclo
  vê, no passo de confirmação, um toggle "Usar meu plano (`N` cortes restantes)" — marcado por
  padrão. Se ele confirma com o toggle marcado, o agendamento é criado vinculado à assinatura e o
  contador do ciclo é decrementado (incrementado o "usado") atomicamente; se o toggle está
  desmarcado (ou ele não tem plano/cortes), o agendamento segue exatamente como hoje (avulso, sem
  nenhuma mudança de comportamento).
- Se, por qualquer corrida (duas abas, etc.), os cortes acabarem entre a hora de montar a tela e o
  envio, o backend rejeita (`400`, mensagem clara) e o cliente pode reenviar sem o plano — nunca fica
  travado sem conseguir agendar.
- Convidado (sem login) e staff (barbeiro/dono/admin) continuam agendando exatamente como hoje — o
  toggle de plano só aparece para cliente logado com assinatura ativa e cortes disponíveis.

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-backend/src/routes/index.ts` — monta `/plans` e `/subscriptions` (novos).
- `barbearia-backend/src/routes/service.routes.ts` — precedente de rota pública para leitura +
  staff-only para escrita, a adaptar para `/plans` (mas restrito a `DONO`/`ADMIN` na escrita, não
  `BARBEIRO`).
- `barbearia-backend/src/routes/user.routes.ts` — precedente de rota 100% `DONO`/`ADMIN`.
- `barbearia-backend/src/controllers/appointment.controller.ts::create` (linhas 8-58) — precisa
  extrair `usePlan` do body e repassar ao service.
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx` (step 4, linhas 386-407) — novo toggle de
  uso de plano antes de `AgendamentoForm`.
- `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientDashboard.tsx` — nova seção
  "Meu Plano" (novo subcomponente, ex. `MySubscription.tsx`, seguindo o padrão de composição já usado
  com `ClientAppointmentCard.tsx`).
- `barbearia-shelby-frontend/src/app/barber/usuarios/*` — clonado como base estrutural para
  `barber/planos/*`.

### 5.2 Domínio / Regras / Serviços
- `barbearia-backend/src/services/appointmentService.ts::createAppointment` (linhas 177-260) — ponto
  de integração do consumo de plano, dentro da transação existente (linhas 238-258).
- `barbearia-backend/src/services/userService.ts` — precedente de `SAFE_SELECT`/`active` toggle
  (padrão a reaproveitar em `planService.ts`).
- `barbearia-backend/src/services/serviceService.ts` — precedente de CRUD simples sem Zod.
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — reutilizado sem alteração,
  `requireRole('DONO','ADMIN')` para escrita de planos, `requireRole('CLIENTE')` para assinatura.
- `barbearia-backend/src/utils/customErrors.ts` — reutilizado.
- Novo utilitário puro `barbearia-backend/src/utils/subscriptionCycle.ts` — função
  `resolveCurrentCycle(currentCycleStart, cutsUsedInCycle, now)` usando `addMonths` (date-fns),
  compartilhada entre `subscriptionService.getMine` (leitura, sem persistir) e
  `appointmentService.createAppointment` (consumo, persiste dentro da transação).

### 5.3 Persistência / Modelos / Migrações
- `barbearia-backend/prisma/schema.prisma` (raiz do projeto — **não** confundir com
  `barbearia-backend/src/prisma/schema.prisma`, que é um arquivo órfão/desatualizado pré-Epic-0,
  não referenciado pelo `prisma.config.ts` nem usado por nenhuma migration; não será tocado).
  Precisa de:
  - `enum SubscriptionStatus { ACTIVE CANCELLED }`
  - `model Plan { id, name, description?, cutsPerCycle Int, price Float, benefits String?, active
    Boolean @default(true), createdAt, updatedAt, subscriptions ClientSubscription[] }`
  - `model ClientSubscription { id, clientId Int, planId Int, status SubscriptionStatus
    @default(ACTIVE), startDate DateTime @default(now()), currentCycleStart DateTime
    @default(now()), cutsUsedInCycle Int @default(0), createdAt, updatedAt, client User
    @relation(...), plan Plan @relation(...), appointments Appointment[] }`
  - `User.subscriptions ClientSubscription[]` (nova relação inversa)
  - `Appointment.subscriptionId Int?` + `Appointment.subscription ClientSubscription?
    @relation(...)` (aditivo, opcional — relação padrão do Prisma para FK opcional já é
    `onDelete: SetNull`, mesmo comportamento observado hoje em `Appointment.clientId`/`adminId`,
    confirmado em `prisma/migrations/20260730002447_rbac_user_unification/migration.sql:40-41`).
  - **Migration nova, 100% aditiva**: `CREATE TYPE "SubscriptionStatus"`, dois `CREATE TABLE`, um
    `ALTER TABLE "Appointment" ADD COLUMN "subscriptionId" INTEGER` + FK. Sem `DROP`/`RENAME`/`NOT
    NULL` sem default em coluna existente com dados — segue o mesmo padrão de risco baixo das
    migrations dos Epics 2 e 4 (`20260730232349_add_business_hours_and_holiday`,
    `20260731002326_add_user_active_flag`). Ainda assim, revisar o SQL gerado antes de aplicar
    (regra do processo).
- `barbearia-backend/src/prisma/seed.ts` — não precisa de alteração; planos são cadastrados via
  UI/API pelo dono (mesmo padrão observado para `Service` no Epic 7 — não é seedado).

### 5.4 Integrações externas (clients/adapters/providers)
- Nenhuma. Confirmado: não há gateway de pagamento (Stripe/PagSeguro/Mercado Pago/etc.) em nenhum
  dos dois repos — busca por "stripe"/"payment"/"pagamento" nos `package.json` não retornou
  dependências desse tipo. Reforça a decisão de assinatura ser só registro interno.

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/app/barber/usuarios/*` (Epic 4) — precedente completo (listagem +
  modal + toggle + `ConfirmationModal`) a clonar como `barber/planos/*`.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/ConfirmationModal.tsx` —
  reaproveitado para confirmar ativar/desativar plano, cancelar assinatura.
- `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientAppointmentCard.tsx` — padrão de
  card dentro de `ClientDashboard`, a seguir estilisticamente para o novo bloco "Meu Plano".
- `barbearia-shelby-frontend/src/hooks/useUsers.tsx` — precedente de hook `dono`-only com CRUD
  (`fetchAll`/`createUser`/`updateUser`/`toggleActive`) a clonar para `usePlans.tsx`.
- `barbearia-shelby-frontend/src/hooks/useClientData.tsx` — precedente de hook client-only
  (`getHeaders`, `auth.user`) a seguir para um novo `useSubscription.tsx`.
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — reutilizado sem
  alteração (`allowedUserType={['dono','admin']}` para `/barber/planos/layout.tsx`).

### 5.6 Testes / Fixtures (se existirem)
- Não há testes automatizados (`*.test.ts`/`*.spec.ts`/`*.cy.*`) cobrindo agendamento, usuários ou
  planos em nenhum dos dois repositórios — mesmo achado de todos os epics anteriores. Validação
  depende de build/lint limpos + walkthrough manual (E2E via browser).

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-backend/src/services/userService.ts` — `active: Boolean` + toggle via `update`, sem
  hard delete (mesmo padrão para `Plan`).
- `barbearia-backend/src/services/holidayService.ts`/`businessHoursService.ts` — captura de `P2002`
  para conflito, `CustomError` com status apropriado.
- `barbearia-backend/src/services/appointmentService.ts::checkAvailability`+transação — padrão
  "checar de novo dentro da transação antes de gravar", reaplicado para consumo de plano.
- `barbearia-shelby-frontend/src/app/barber/usuarios/*` completo — estrutura-base para
  `barber/planos/*` (layout + hook + page + modal + scss).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/ConfirmationModal.tsx` —
  modal de confirmação genérico, reaproveitado (não recriar).

## 7) Documentação externa (via Context7)
Feature é composta por padrões já em uso no próprio codebase: (a) tabelas Prisma novas + queries
`findMany`/`create`/`update`/`findFirst` nos mesmos moldes de `userService.ts`/`holidayService.ts`;
(b) rotas Express com `authMiddleware`/`requireRole`, idênticas às já existentes; (c) `addMonths` do
`date-fns` (já uma dependência direta do projeto, `^4.1.0`, já importado em
`appointmentService.ts` via `format`/`ptBR` do mesmo pacote) — função pura, sem necessidade de nova
configuração; (d) formulário/modal React controlado, mesmo padrão de `UserFormModal.tsx`. Nenhuma
API nova de biblioteca é introduzida.

### Consultas realizadas
Nenhuma consulta ao Context7 foi necessária — mesma justificativa dos PRDs anteriores (Epics 1, 2,
4): toda a implementação reusa APIs já utilizadas de forma idêntica em outros pontos do mesmo
repositório, incluindo o próprio `date-fns` já instalado e importado.

### Trechos relevantes
- N/A.

## 8) Impactos prováveis (áreas afetadas)
- **Backend — schema**: duas tabelas novas (`Plan`, `ClientSubscription`), um enum novo
  (`SubscriptionStatus`), uma coluna nova opcional em `Appointment` (`subscriptionId`), uma relação
  inversa nova em `User` (`subscriptions`) — migration 100% aditiva.
- **Backend — API nova**: `planService.ts`/`plan.controller.ts`/`plan.routes.ts` (montada em
  `/api/plans`) e `subscriptionService.ts`/`subscription.controller.ts`/`subscription.routes.ts`
  (montada em `/api/subscriptions`), novo utilitário `subscriptionCycle.ts`.
- **Backend — endpoint existente alterado**: `POST /api/appointments` (via
  `AppointmentService.createAppointment`) ganha um campo opcional `usePlan` no payload — puramente
  aditivo, comportamento existente (sem `usePlan` ou `usePlan: false`) permanece idêntico. **Mudança
  de contrato de API a sinalizar ao usuário** (regra do `CLAUDE.md` raiz), ainda que aditiva e
  retrocompatível.
- **Frontend — nova página**: `/barber/planos` (DONO/ADMIN).
- **Frontend — nova seção**: "Meu Plano" dentro de `/meus-servicos` (cliente).
- **Frontend — wizard existente alterado**: `/agendamento`, passo de confirmação, novo toggle
  condicional (não afeta o fluxo de quem não tem plano).
- **Frontend — navegação**: `BarberHeader.tsx` ganha um link "Planos" condicional a `dono`/`admin`.

## 9) Critérios de aceitação
- [ ] Dono/admin autenticado consegue acessar `/barber/planos` (inacessível a barbeiro, cliente e
      visitante) e cadastrar um plano (nome, cortes por ciclo, preço, benefícios opcionais).
- [ ] Dono/admin consegue editar um plano existente e ativar/desativar (com confirmação); planos
      desativados somem da listagem pública (`GET /plans`) mas continuam acessíveis a quem já
      assinou.
- [ ] Cliente logado consegue ver planos disponíveis dentro de `/meus-servicos` e assinar um; a
      assinatura fica `ACTIVE` imediatamente, com ciclo começando na data da assinatura.
- [ ] Cliente com assinatura ativa não consegue assinar um segundo plano sem antes cancelar o atual
      (erro claro).
- [ ] Cliente logado com assinatura ativa e cortes disponíveis vê, no passo de confirmação de
      `/agendamento`, a opção de usar o plano; ao confirmar com a opção marcada, o agendamento é
      criado vinculado à assinatura e o contador de cortes usados no ciclo é incrementado.
- [ ] Cliente que já usou todos os cortes do ciclo atual não consegue marcar/usar a opção de plano
      (ou, se tentar via API diretamente, recebe 400 claro) — mas consegue agendar normalmente
      (avulso), sem nenhum bloqueio ao fluxo de agendamento em si.
- [ ] O ciclo do plano reinicia automaticamente na "data de aniversário" da assinatura (mesmo dia do
      mês da assinatura original), não no dia 1 do mês civil — verificável comparando
      `GET /subscriptions/me` antes/depois de uma virada de ciclo simulada.
- [ ] Cliente consegue cancelar a própria assinatura (`PATCH /subscriptions/me/cancel`); depois de
      cancelada, `GET /subscriptions/me` não retorna mais uma assinatura ativa e o toggle de plano
      some do wizard de agendamento.
- [ ] Dono não consegue criar assinatura em nome de um cliente — os endpoints de assinatura são
      `CLIENTE`-only; não existe nenhuma rota/ação em `/barber/planos` ou em qualquer outra página
      staff para atribuir plano a um cliente.
- [ ] Barbeiro, admin (para as rotas de assinatura) e visitante não conseguem acessar/chamar as
      rotas restritas indevidamente (403/401 conforme o caso).
- [ ] Regra transversal do `ROADMAP_V2.md`: visitante e cliente continuam acessando exatamente as
      páginas já existentes (`/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`,
      `/agendamento`, `/meus-servicos`) sem restrição nova; agendamento de convidado/staff continua
      funcionando sem nenhuma mudança de comportamento (toggle de plano nunca aparece pra eles).

## 10) Open Questions (bloqueios / dúvidas)
Nenhuma. As decisões de negócio ambíguas do épico foram resolvidas com as premissas conservadoras
já definidas para esta execução (documentadas na seção 2 "Não inclui" e ao longo deste PRD):
esgotar os cortes do ciclo bloqueia apenas o *uso do plano* naquele agendamento (não bloqueia
agendar — cliente paga avulso normalmente); o ciclo mensal reinicia na data de assinatura, não no
dia 1; o dono nunca cria assinatura em nome de cliente, só cadastra os planos; não há gateway de
pagamento neste epic (assinatura é registro interno, sem cobrança automatizada). Decisões táticas
adicionais fechadas por evidência de codebase/precedente: plano usa toggle `active` (não hard
delete, mesmo padrão de `User.active`); 1 corte do plano cobre qualquer serviço do catálogo (não
há segmentação por serviço no texto do épico); só uma assinatura `ACTIVE` por cliente por vez;
sem página pública de catálogo de planos (fica dentro de `/meus-servicos`, já client-only). Serão
formalizadas como Decision Log na Fase 2 (planejamento).
