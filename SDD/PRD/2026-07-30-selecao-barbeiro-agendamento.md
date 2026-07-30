# PRD — Seleção de barbeiro no fluxo de agendamento com checagem de disponibilidade por profissional

## 1) Objetivo
- Permitir que o cliente escolha o barbeiro (profissional) no fluxo de agendamento (`/agendamento`), e que a checagem de disponibilidade de horário passe a considerar o barbeiro selecionado, não mais o conjunto global de agendamentos.
- Hoje um horário ocupado por qualquer profissional bloqueia esse horário para todos os outros — impede a barbearia de operar com múltiplos barbeiros em paralelo. Corrigir isso é o valor central desta feature.

## 2) Escopo
**Inclui**
- Novo passo de seleção de barbeiro no wizard de `/agendamento` (frontend).
- Endpoint público (ou acessível no fluxo de agendamento, incluindo visitante não logado) para listar barbeiros selecionáveis.
- Filtragem de disponibilidade por `adminId` (barbeiro) no backend: `AppointmentService.checkAvailability` e a checagem duplicada dentro da transação de `createAppointment`.
- Ajuste da geração de horários no frontend para consultar/considerar apenas os agendamentos do barbeiro selecionado.
- Passagem do `adminId` do barbeiro escolhido no payload de criação do agendamento em todos os fluxos (visitante, cliente logado, staff agendando para terceiros).
- Fallback de horário de funcionamento: manter o hardcoded atual (9h–20h BRT, `validateBusinessHours`) — Epic 2 (horário configurável) ainda não foi implementado.

**Não inclui (fora de escopo)**
- Horário de funcionamento configurável por barbeiro ou globalmente (Epic 2).
- CRUD de feriados/bloqueios (Epic 2).
- Agenda diária tipo calendário (Epic 3).
- Qualquer mudança em `BillingController`/dashboards por barbeiro (Epic 6).
- CRUD de usuários/barbeiros (Epic 4) — a feature apenas **lista** barbeiros já existentes (criados hoje só via seed/Prisma Studio, já que não há CRUD de staff).
- Mudança de regra de negócio do horário estranho já hardcoded no frontend (ver 3) além do necessário para filtrar por barbeiro — comportamento de dias/horários em si é uma pré-existência não relacionada a este epic.

## 3) Fluxo atual (como funciona hoje)

### Backend
- `AppointmentService.checkAvailability(startDateTime, endDateTime, excludeAppointmentId?)` ([appointmentService.ts:52-70](../../src/services/appointmentService.ts)) conta agendamentos `CONFIRMED` que se sobrepõem ao intervalo, **sem nenhum filtro por `adminId`**. Ou seja, um horário ocupado por qualquer barbeiro bloqueia esse horário para todos.
- Dentro de `createAppointment`, há uma segunda checagem de sobreposição **duplicada e independente**, feita dentro da `prisma.$transaction` ([appointmentService.ts:168-181](../../src/services/appointmentService.ts)) — também sem filtro por `adminId`. Essa é a checagem que efetivamente decide se o agendamento é criado (a primeira, fora da transação, é só uma pré-checagem que pode ter race condition).
- `validateBusinessHours(start, durationMinutes)` ([appointmentService.ts:31-50](../../src/services/appointmentService.ts)) valida 9h–20h BRT hardcoded, sem qualquer relação com barbeiro.
- `createAppointment` recebe `adminId?: number` no payload ([appointmentService.ts:9-16](../../src/services/appointmentService.ts)). Se não vier `adminId`, o serviço escolhe **qualquer** usuário com `role !== 'CLIENTE'` como profissional padrão ([appointmentService.ts:144-149](../../src/services/appointmentService.ts)): `prisma.user.findFirst({ where: { role: { not: 'CLIENTE' } } })`. Isso inclui DONO e ADMIN, não só BARBEIRO.
- `AppointmentController.create` ([appointment.controller.ts:8-58](../../src/controllers/appointment.controller.ts)) repassa `adminId` do body (se vier) sem validar se o `id` de fato pertence a um usuário com papel de barbeiro.
- `POST /api/appointments` é **público** (sem `authMiddleware`) — preserva agendamento de convidado ([appointment.routes.ts:11](../../src/routes/appointment.routes.ts)).
- `GET /api/appointments?date=` ([appointment.routes.ts:12](../../src/routes/appointment.routes.ts) → `AppointmentController.listAll` → `AppointmentService.listAll`, [appointmentService.ts:73-106](../../src/services/appointmentService.ts)) filtra só por `date` e `clientId` — **não existe filtro por `adminId`** hoje. Requer `authMiddleware` (rota autenticada). Cada item retornado inclui `admin: { id, name, email }`.
- Não existe hoje nenhum endpoint público que liste **barbeiros**. `GET /api/admin` ([admin.routes.ts:14](../../src/routes/admin.routes.ts) → `AdminController.listAll` → `AdminService.listAll`, [adminService.ts:9-22](../../src/services/adminService.ts)) lista todos os usuários com `role !== 'CLIENTE'` (BARBEIRO + DONO + ADMIN), mas é restrito a `requireRole('DONO', 'ADMIN')` — inacessível a visitante/cliente no fluxo de agendamento.
- Papel `BARBEIRO` já existe no enum `UserRole` do schema (`CLIENTE | BARBEIRO | DONO | ADMIN`), criado no Epic 0. Seed atual ([prisma/seed.ts](../../src/prisma/seed.ts)) cria 1 `DONO`, 1 `ADMIN`, 1 `BARBEIRO`.
- Modelo `Appointment` ([schema.prisma:38-54](../../prisma/schema.prisma)): campo `adminId Int?` com relação `admin User? @relation("AppointmentStaff", ...)` — nome do campo é herança do modelo anterior (pré-Epic 0), mas semanticamente já representa "profissional responsável pelo agendamento" e aceita qualquer `User` (independente do role).

### Frontend
- `/agendamento` (`src/app/agendamento/page.tsx`) é um wizard de 3 passos visíveis: **1. Serviço → 2. Data & Hora → 3. Dados do cliente → 4. Confirmação**. Não existe passo de seleção de barbeiro.
- A disponibilidade de horários é calculada **inteiramente no client**, em `generateTimeSlotsForDate` ([page.tsx:53-139](../../../barbearia-shelby-frontend/src/app/agendamento/page.tsx)):
  - Busca `GET /appointments?date=YYYY-MM-DD` (todos os agendamentos do dia, de qualquer profissional).
  - Filtra os com `status === 'CONFIRMED'`.
  - Gera uma lista fixa de horários (`09:00`...`19:30`, com regras diferentes para sábado/sexta/outros dias, hardcoded no componente).
  - Marca como indisponível qualquer slot que colida com **qualquer** agendamento confirmado do dia, **sem considerar de qual profissional é o agendamento**. Este é o espelho, no frontend, do mesmo bug de "checagem global" do backend.
- No `handleBookingSubmit` ([page.tsx:170-247](../../../barbearia-shelby-frontend/src/app/agendamento/page.tsx)), o payload só inclui `adminId` quando o usuário autenticado é staff (`barbeiro`/`dono`/`admin`) agendando em nome de um cliente/convidado ([page.tsx:197-209](../../../barbearia-shelby-frontend/src/app/agendamento/page.tsx)). Para visitante ou cliente logado, `adminId` nunca é enviado — cai sempre no fallback arbitrário do backend.
- `AgendamentoForm` ([src/components/Agendamento/AgendamentoForm.tsx](../../../barbearia-shelby-frontend/src/components/Agendamento/AgendamentoForm.tsx)) é o formulário de dados do cliente (nome/email/telefone/observação), validado com `bookingSchema` (Zod) — não tem relação direta com seleção de barbeiro, mas é o padrão de formulário/step a seguir para consistência visual.
- `AuthContext` ([src/context/AuthContext.tsx](../../../barbearia-shelby-frontend/src/context/AuthContext.tsx)) expõe `user.userType: 'cliente' | 'barbeiro' | 'dono' | 'admin'` e `user.id`.
- Estilos do wizard em `agendamento-moderno.module.scss` já têm um padrão de grid de cards reutilizável (`.serviceGrid` / `.serviceCard`) usado para a seleção de serviço — candidato natural a reuso para a seleção de barbeiro.

## 4) Fluxo desejado (comportamento esperado)
- Cliente (ou visitante) escolhe o serviço, depois escolhe o barbeiro dentre os profissionais disponíveis (novo passo), depois vê data/hora com disponibilidade **específica daquele barbeiro**, preenche os dados e confirma.
- O backend passa a impedir dois agendamentos confirmados sobrepostos **para o mesmo barbeiro**, mas permite agendamentos sobrepostos para barbeiros diferentes.
- O horário de funcionamento continua sendo o hardcoded 9h–20h BRT (fallback), igual para todos os barbeiros, até o Epic 2 existir.
- Staff (barbeiro/dono/admin) continua podendo agendar em nome de um cliente/convidado, especificando o barbeiro responsável (hoje já faz isso implicitamente ao logar como esse staff — comportamento a preservar/clarificar na fase de planejamento).

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-backend/src/routes/appointment.routes.ts` — rotas de agendamento (`POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`).
- `barbearia-backend/src/controllers/appointment.controller.ts` — `create`, `listAll`, `getById`, `update`, `delete`.
- `barbearia-backend/src/routes/admin.routes.ts` + `src/controllers/admin.controller.ts` — listagem de staff, hoje restrita a DONO/ADMIN.
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx` — tela/wizard de agendamento (ponto de entrada principal do frontend para esta feature).

### 5.2 Domínio / Regras / Serviços
- `barbearia-backend/src/services/appointmentService.ts` — `checkAvailability`, `validateBusinessHours`, `createAppointment`, `update` (reagendamento também chama `checkAvailability`).
- `barbearia-backend/src/services/adminService.ts` — `listAll` (staff, sem filtro de role específico BARBEIRO), `findById`.
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — checagem de papel via `req.user.role`.

### 5.3 Persistência / Modelos / Migrações
- `barbearia-backend/prisma/schema.prisma`:
  - `model User` com `enum UserRole { CLIENTE BARBEIRO DONO ADMIN }` — já existe, não precisa migration para o papel em si.
  - `model Appointment`: `adminId Int?` (FK opcional para `User`, relação `AppointmentStaff`) — já suporta vincular a um barbeiro específico; não requer alteração de schema para o filtro de disponibilidade (é lógica de query, não de dado).
  - Nenhuma tabela de horário de funcionamento/feriados (fora de escopo, Epic 2).
- **Migrations**: projeto usa Prisma 7 (`npx prisma migrate dev` / `deploy`), não Flask-Migrate. Não há indício de que esta feature precise de migration de schema (o campo `adminId` e o role `BARBEIRO` já existem) — a confirmar na fase de planejamento se alguma decisão tática exigir campo novo (ex.: flag "ativo para agendamento" em `User`).

### 5.4 Integrações externas (clients/adapters/providers)
- Nenhuma integração externa nova identificada para esta feature (não mexe em WhatsApp/e-mail/Puppeteer).

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx` — orquestra o wizard e chamadas à API.
- `barbearia-shelby-frontend/src/app/agendamento/agendamento-moderno.module.scss` — estilos do wizard, incl. `.serviceGrid`/`.serviceCard` reutilizáveis para um novo grid de barbeiros.
- `barbearia-shelby-frontend/src/components/Agendamento/AgendamentoForm.tsx` — formulário de dados do cliente (passo 3), não precisa mudar, mas ilustra o padrão de step controlado por `page.tsx`.
- `barbearia-shelby-frontend/src/context/AuthContext.tsx` — fornece `user.userType`/`user.id` para o caso de staff agendando para terceiros.
- `barbearia-shelby-frontend/src/services/api.ts` — client axios (`baseURL = NEXT_PUBLIC_API_URL + /api`), usado para todas as chamadas.

### 5.6 Testes / Fixtures (se existirem)
- Não há testes automatizados hoje para agendamento em nenhum dos dois repositórios (busca por `*.test.ts`, `*.spec.ts`, `*.cy.*` em ambos os repos não retornou nenhum arquivo). `package.json` do frontend declara Jest/Testing Library/Cypress como stack, mas sem specs escritos ainda. Validação desta feature dependerá de build/lint limpos + walkthrough manual no navegador.

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-shelby-frontend/src/app/agendamento/agendamento-moderno.module.scss` — `.serviceGrid`/`.serviceCard` (grid de cards clicáveis) já implementa exatamente o padrão visual necessário para "escolha o barbeiro"; reusar em vez de criar novo estilo.
- `barbearia-backend/src/services/adminService.ts::listAll` — já sabe listar usuários de staff com `select` seguro (sem senha); pode ser estendido/reaproveitado para expor barbeiros publicamente em vez de duplicar a query em outro lugar.
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — padrão já usado em toda a API para restringir rotas por papel; reusar se a nova rota de listagem de barbeiros precisar de alguma restrição (hoje a leitura de `services` é pública nesse mesmo padrão — `service.routes.ts:11-12` — bom precedente de "GET público, mutações restritas").
- `CustomError` (`barbearia-backend/src/utils/customErrors.ts`, usado em `appointmentService.ts`) — padrão de erro de negócio já usado em `checkAvailability`/`validateBusinessHours`; reusar para qualquer nova validação (ex.: `adminId` inválido ou não é barbeiro).

## 7) Documentação externa (via Context7)
Feature é composta majoritariamente por lógica de negócio (filtro de query Prisma) e UI de formulário React já com padrões estabelecidos no próprio repo — não depende de API nova de nenhuma biblioteca externa (Prisma, Express, React, Zod, date-fns já em uso do mesmo jeito). Não foram identificadas necessidades de consulta a Context7 para esta feature além do que já está documentado no uso corrente do Prisma Client (`prisma.appointment.count`/`findMany` com `where` composto), que já é utilizado nos mesmos moldes em `appointmentService.ts`.

### Consultas realizadas
Nenhuma consulta ao Context7 foi necessária — a feature reusa exclusivamente APIs (Prisma `where`/`AND`, Express `Router`, React `useState`/`useEffect`) já usadas de forma idêntica em outros pontos do mesmo arquivo/repositório, sem introduzir versão ou API nova.

### Trechos relevantes
- N/A.

## 8) Impactos prováveis (áreas afetadas)
- **Backend — regra de disponibilidade**: `appointmentService.ts` (`checkAvailability` + checagem duplicada em `createAppointment` + possivelmente `update`/reagendamento) precisam filtrar por `adminId`.
- **Backend — nova leitura pública de barbeiros**: alguma rota/serviço precisa expor a lista de barbeiros para o fluxo de agendamento (hoje só existe listagem de staff restrita a DONO/ADMIN).
- **Backend — validação de `adminId` recebido**: `createAppointment` hoje aceita qualquer `adminId` numérico sem validar que corresponde a um usuário com papel apropriado.
- **Frontend — novo passo no wizard**: `/agendamento/page.tsx` precisa de um novo step de seleção de barbeiro, novo estado (`selectedBarber`), nova chamada à API, e envio de `adminId` no payload em todos os fluxos (não só staff-para-terceiros).
- **Frontend — geração de horários**: `generateTimeSlotsForDate` precisa considerar o barbeiro selecionado ao decidir quais slots estão ocupados.
- **Contrato de API**: potencial adição de query param (`adminId`) em `GET /api/appointments` e/ou novo endpoint de listagem de barbeiros — mudança de contrato entre os repos, a sinalizar explicitamente (regra do `CLAUDE.md` raiz).

## 9) Critérios de aceitação
- [ ] No fluxo de `/agendamento`, cliente/visitante escolhe um barbeiro antes (ou como parte) da escolha de data/hora.
- [ ] Os horários exibidos como disponíveis refletem a agenda do barbeiro selecionado, não a agenda global da barbearia.
- [ ] É possível dois barbeiros terem agendamentos `CONFIRMED` no mesmo horário simultaneamente (sem colisão indevida).
- [ ] Não é possível criar dois agendamentos `CONFIRMED` sobrepostos para o **mesmo** barbeiro (a regra de conflito continua valendo, agora por profissional).
- [ ] O horário de funcionamento hardcoded (9h–20h BRT) continua sendo respeitado (sem regressão), até o Epic 2 existir.
- [ ] Fluxo de agendamento como convidado (sem login) continua funcionando ponta a ponta, incluindo a nova seleção de barbeiro.
- [ ] Fluxo de staff (barbeiro/dono/admin) agendando em nome de um cliente continua funcionando.
- [ ] Regra transversal do `ROADMAP_V2.md`: visitante e cliente continuam acessando exatamente as páginas já existentes (`/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`, `/meus-servicos`) sem restrição nova.

## 10) Open Questions (bloqueios / dúvidas)
- Quais papéis devem aparecer na lista de "barbeiros selecionáveis" no agendamento: só `BARBEIRO`, ou também `DONO`/`ADMIN` (que hoje também podem ser atribuídos como `adminId` via fallback)? — a resolver na fase de planejamento com evidência do codebase (ex.: intenção declarada no Epic 0 do `ROADMAP_V2.md`).
- A checagem de disponibilidade por barbeiro deve ser feita via novo query param em `GET /api/appointments` (`?adminId=`), via filtragem client-side (o payload já retorna `admin.id` por agendamento), ou via novo endpoint dedicado (ex.: `GET /api/appointments/availability`)? — decisão tática de spec.
- Deve existir validação server-side de que o `adminId` enviado corresponde a um usuário com papel elegível para agendamento (evitar, por ex., agendar com um `clientId` como `adminId`)? — decisão tática de spec.
- O endpoint de listagem de barbeiros deve ser público (sem auth) para suportar visitante não logado, análogo a `GET /services`? — decisão tática de spec.
