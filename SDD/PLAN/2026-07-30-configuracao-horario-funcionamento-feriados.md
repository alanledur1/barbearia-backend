PLAN PATH: barbearia-backend/SDD/PLAN/2026-07-30-configuracao-horario-funcionamento-feriados.md

# Configuração de horário de funcionamento e CRUD de feriados com bloqueio de agendamento nas datas configuradas — Implementation Plan

## Overview
Hoje o horário de funcionamento é hardcoded em `validateBusinessHours` (9h–20h, fuso BRT fixo, igual para todos os dias) e não existe nenhum conceito de feriado/bloqueio — qualquer data futura pode receber agendamento, inclusive Natal ou Ano Novo. Vamos: (1) criar duas tabelas novas (`BusinessHours` — 1 linha por dia da semana; `Holiday` — datas bloqueadas), (2) trocar `validateBusinessHours` por uma versão assíncrona que lê `BusinessHours` do banco (com fallback seguro para 9h–20h se a linha do dia não existir) e adicionar uma nova validação de feriado em `createAppointment`/`update`, (3) expor CRUD dessas duas entidades via API restrita ao papel `DONO`, e (4) criar uma página de configurações no frontend, acessível somente para `dono`, para editar o horário por dia da semana e gerenciar a lista de feriados.

O fluxo público de agendamento (`/agendamento`) **não é alterado** por este plano — continua com sua própria lógica hardcoded de geração de horários no frontend (decisão de escopo documentada no PRD, seção "Não inclui"). O bloqueio de feriado e o novo horário configurável valem para qualquer tentativa de criação/reagendamento via API, independentemente da origem (visitante, cliente, staff) — se alguém tentar agendar num feriado ou fora do horário configurado, o backend rejeita com 400, mesmo que a UI do wizard ainda ofereça aquele horário como aparentemente disponível.

## Scope
### In Scope
- `prisma/schema.prisma`: modelos `BusinessHours` e `Holiday` novos.
- Migration Prisma aditiva (`npx prisma migrate dev`).
- `prisma/seed.ts`: upsert das 7 linhas padrão de `BusinessHours` (09:00–20:00, todo dia, não fechado) — preserva o comportamento atual como default.
- `appointmentService.ts`: `validateBusinessHours` (async, lê `BusinessHours`) + novo método privado de checagem de feriado; `createAppointment` e `update` passam a `await` ambas as validações.
- Backend novo: `businessHoursService.ts`, `holidayService.ts`, `businessHours.controller.ts`, `holiday.controller.ts`, `businessHours.routes.ts`, `holiday.routes.ts`, montados em `routes/index.ts` sob `/api/business-hours` e `/api/holidays`, restritos a `authMiddleware` + `requireRole('DONO')`.
- Frontend novo: página `/barber/configuracoes` (guarda `dono`-only), hook de dados (`useBusinessSettings`), formulário de horário por dia da semana, lista/CRUD de feriados, link de navegação condicional em `BarberHeader.tsx`.

### Out of Scope
- Qualquer mudança em `agendamento/page.tsx` (wizard público) — `generateTimeSlotsForDate`, `DayPicker` e suas regras hardcoded por dia da semana continuam exatamente como estão.
- Horário de funcionamento por barbeiro individual (tabela é global à barbearia).
- Feriados recorrentes (só datas literais, cadastro manual).
- Acesso de `ADMIN` à página de configurações (Epic 5).
- CRUD de usuários, agenda diária, dashboards, planos (Epics 3/4/6/8).
- Qualquer mudança no contrato de `POST /api/appointments`/`PATCH /api/appointments/:id` além do novo motivo de rejeição (400) — formato de payload/response inalterado.

## Current State (from codebase)
- `barbearia-backend/src/services/appointmentService.ts:31-50` — `validateBusinessHours` síncrona, hardcoded (`businessOpenHour = 9`, `businessCloseHour = 20`), sem acesso a banco, sem diferenciação por dia da semana.
- `barbearia-backend/src/services/appointmentService.ts:158` — `createAppointment` chama `this.validateBusinessHours(requestedDateTime, service.duration)` (síncrono, sem `await`).
- `barbearia-backend/src/services/appointmentService.ts:253` — `update` (reagendamento) chama `this.validateBusinessHours(newStartDate, newDuration)` da mesma forma.
- `barbearia-backend/prisma/schema.prisma:1-68` — schema atual: `User`, `Service`, `Appointment`, `AppointmentStatus`, `Otp`. Nenhuma tabela de horário/feriado.
- `barbearia-backend/src/services/prisma.service.ts` — reexporta `{ prisma }` de `src/prisma/db.ts` (client com adapter `pg`), usado por todos os `*Service`.
- `barbearia-backend/src/prisma/seed.ts` — cria 3 usuários via `upsert`; roda com `npm run seed`, não roda automaticamente no deploy (`npm run deploy` = `migrate` + `build`, conforme `DEPLOY_NORTHFLANK.md:104`).
- `barbearia-backend/src/routes/index.ts:1-25` — monta cada `Router` de área; local de mount das 2 rotas novas.
- `barbearia-backend/src/routes/admin.routes.ts:14-17` — precedente de rota restrita a staff (`authMiddleware` + `requireRole('DONO','ADMIN')`); aqui adaptado para `requireRole('DONO')` isoladamente.
- `barbearia-backend/src/services/serviceService.ts:1-103` — precedente de `*Service` fino sobre `prisma.<model>.*`, sem camada extra.
- `barbearia-backend/src/utils/customErrors.ts` — `CustomError(message, statusCode, details?)`.
- `barbearia-backend/prisma/migrations/` — 5 migrations existentes, a mais recente `20260730002447_rbac_user_unification`; pasta versionada no git (bug de `.gitignore` corrigido no Epic 0).
- `barbearia-shelby-frontend/src/app/barber/layout.tsx` — `ProtectedRoute allowedUserType={['barbeiro','dono','admin']}`, guarda de primeiro nível de toda a área `/barber`.
- `barbearia-shelby-frontend/src/app/barber/billing/page.tsx` + `BillingDashboard.tsx` + `Billing.module.scss` — precedente de subpágina simples dentro de `/barber`.
- `barbearia-shelby-frontend/src/hooks/useBarberData.tsx` — precedente de hook com `getHeaders()` (`Authorization: Bearer`), `fetchAll`, tratamento de erro via `err.response?.data?.error`.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` — botões de navegação via `next/link`; local de inserção do novo link (condicional a `userType === 'dono'`); ainda não importa `useAuth`.
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — componente de guarda reutilizável (`allowedUserType`).
- Não há testes automatizados (`*.test.ts`/`*.spec.ts`/`*.cy.*`) cobrindo agendamento, serviços ou admin em nenhum dos dois repos.

## Desired End State
- Dono autenticado acessa `/barber/configuracoes`, vê o horário por dia da semana (7 linhas), edita e salva; vê a lista de feriados, adiciona e remove.
- Qualquer tentativa de criar/reagendar um agendamento (via API) fora do horário configurado para aquele dia da semana, ou numa data de feriado, é rejeitada com 400 e mensagem clara.
- Sem nenhuma configuração manual (estado logo após a migration/seed), o comportamento é idêntico ao atual: 9h–20h todos os dias, nenhum feriado.
- Barbeiro, admin, cliente e visitante não conseguem acessar `/barber/configuracoes` (redirecionados) nem as rotas `/api/business-hours`/`/api/holidays` (403/401).
- Verificação: `npm run build` limpo nos dois repos; `npx eslint src` limpo no frontend; walkthrough manual no navegador (dono editando horário/feriados; tentativa de agendamento fora do horário/num feriado rejeitada via API; barbeiro/admin bloqueados da página nova; as 7 rotas públicas/cliente da regra transversal continuam acessíveis).

## References
- PRD: `barbearia-backend/SDD/PRD/2026-07-30-configuracao-horario-funcionamento-feriados.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-07-30-configuracao-horario-funcionamento-feriados.md`
- Key code references:
  - `barbearia-backend/src/services/appointmentService.ts:29-50,145-227,229-265`
  - `barbearia-backend/prisma/schema.prisma:1-68`
  - `barbearia-backend/src/routes/index.ts:1-25`
  - `barbearia-shelby-frontend/src/app/barber/layout.tsx`, `barber/billing/*`
  - `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`

---

## Phase 1: Schema — `BusinessHours` e `Holiday`
### Tasks
- [x] Adicionar `model BusinessHours` e `model Holiday` a `barbearia-backend/prisma/schema.prisma` (ver Spec para os campos exatos).
- [x] Rodar `npx prisma migrate dev --name add_business_hours_and_holiday` dentro de `barbearia-backend/`.
- [x] Revisar o SQL gerado em `prisma/migrations/<timestamp>_add_business_hours_and_holiday/migration.sql`: confirmar que só há `CREATE TABLE` (nenhum `DROP`/`ALTER` em tabela existente).
- [x] Adicionar ao `barbearia-backend/src/prisma/seed.ts` um upsert das 7 linhas padrão de `BusinessHours` (`dayOfWeek` 0–6, `openTime: '09:00'`, `closeTime: '20:00'`, `isClosed: false`).
- [x] Rodar `npm run seed` localmente e confirmar que as 7 linhas foram criadas sem erro.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npx prisma migrate dev --name add_business_hours_and_holiday` — aplica sem erro.
- [x] `cd barbearia-backend && npx prisma generate` — Prisma Client regenerado sem erro (roda também via `postinstall`).
- [x] `cd barbearia-backend && npm run build` — compila sem erros (confirma que os tipos novos do Prisma Client — `prisma.businessHours`, `prisma.holiday` — estão disponíveis).

#### Manual Verification
- [x] Inspecionar o arquivo `migration.sql` gerado (leitura direta) e confirmar que contém apenas `CREATE TABLE "BusinessHours"` e `CREATE TABLE "Holiday"` (mais índices/constraints de `@unique`), sem nenhuma instrução destrutiva. Confirmado: só `CREATE TABLE`/`CREATE UNIQUE INDEX`.
- [x] Rodar `npm run seed` e confirmar via uma query rápida (script pontual com o Prisma Client) que existem 7 linhas em `BusinessHours` com os valores padrão esperados (`dayOfWeek` 0-6, 09:00-20:00, `isClosed: false`). Confirmado.

---

## Phase 2: Backend — CRUD de `BusinessHours` e `Holiday`
### Tasks
- [x] Criar `barbearia-backend/src/services/businessHoursService.ts` (`listAll`, `updateBulk`).
- [x] Criar `barbearia-backend/src/services/holidayService.ts` (`listAll`, `create`, `delete`).
- [x] Criar `barbearia-backend/src/controllers/businessHours.controller.ts` (`listAll`, `updateBulk`).
- [x] Criar `barbearia-backend/src/controllers/holiday.controller.ts` (`listAll`, `create`, `delete`).
- [x] Criar `barbearia-backend/src/routes/businessHours.routes.ts` e `barbearia-backend/src/routes/holiday.routes.ts` (`authMiddleware` + `requireRole('DONO')` em todas as rotas).
- [x] Montar as duas novas rotas em `barbearia-backend/src/routes/index.ts` (`/business-hours`, `/holidays`).

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [x] Com o servidor local rodando e um token de `DONO` (login via `POST /api/login`), `GET /api/business-hours` retorna 200 com as 7 linhas; `PUT /api/business-hours` com um payload válido (7 entradas, uma por `dayOfWeek`) retorna 200 com os valores atualizados; payload inválido (ex.: `dayOfWeek` repetido, `openTime >= closeTime` sem `isClosed`) retorna 400. Confirmado via curl real.
- [x] `GET /api/holidays` retorna 200 (lista vazia inicialmente); `POST /api/holidays` com `{ date, reason }` válido retorna 201; `POST` repetindo a mesma data retorna 409; `DELETE /api/holidays/:id` retorna 204 e o item some da listagem. Confirmado via curl real.
- [x] Sem token (ou com token de `barbeiro`/`admin`), todas as rotas acima retornam 401/403. Confirmado via curl real (barbeiro → 403, admin → 403, sem token → 401).

---

## Phase 3: Backend — horário configurável e bloqueio de feriado no fluxo de agendamento
### Tasks
- [x] Reescrever `validateBusinessHours` em `appointmentService.ts` para ser `async`, consultar `prisma.businessHours.findUnique({ where: { dayOfWeek } })` (dia da semana calculado em BRT) e validar `startMinutes`/`endMinutes` contra `openTime`/`closeTime` (ou rejeitar se `isClosed`), com fallback para 9h–20h se a linha não existir.
- [x] Adicionar método privado `validateNotHoliday(start: Date)` que consulta `prisma.holiday.findUnique({ where: { date } })` (data BRT, sem horário) e lança `CustomError` se encontrado.
- [x] `createAppointment`: `await this.validateBusinessHours(...)` (já existente, agora com `await`) + nova chamada `await this.validateNotHoliday(requestedDateTime)`.
- [x] `update` (reagendamento): mesmo par de `await` para `newStartDate`.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [x] Com o servidor local rodando: alterado (via `PUT /api/business-hours`, com token `DONO`) o horário de segunda-feira (`dayOfWeek=1`) para uma janela estreita (10:00–11:00); confirmado via `POST /api/appointments` real que 09:00 (antes) é rejeitado (400, "Agendamentos permitidos apenas a partir das 10:00."), 10:15 (dentro, 20min) é aceito (201), e 10:45 (termina 11:05, excede o fechamento) é rejeitado (400, "Agendamentos permitidos até as 11:00.").
- [x] Cadastrado um feriado para 2026-08-05 (`POST /api/holidays`); confirmado via `POST /api/appointments` real que uma tentativa de agendamento às 14:00 nessa data é rejeitada (400, "A barbearia está fechada nesta data (feriado)."); removido o feriado (`DELETE`) e confirmado que a mesma tentativa volta a ser aceita (201).
- [x] Horário de segunda-feira e lista de feriados restaurados para os valores padrão (09:00–20:00, nenhum feriado) ao final do teste; agendamentos de teste criados foram deletados.

---

## Phase 4: Frontend — página de configurações (dono only)
### Tasks
- [x] Criar `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` (fetch/update de `businessHours` e `holidays`, seguindo o padrão de `useBarberData.tsx`).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx` (guarda adicional `ProtectedRoute allowedUserType={['dono']}`, aninhado dentro do layout de `/barber` já existente).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/configuracoes/page.tsx` (formulário de horário por dia da semana + lista/CRUD de feriados).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/configuracoes/Configuracoes.module.scss` (estilos, seguindo os padrões já usados em `Billing.module.scss`/`EditServiceModal.module.scss`).
- [x] Atualizar `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`: importar `useAuth`, renderizar o novo link `Configurações` (`next/link` para `/barber/configuracoes`) somente quando `auth.user?.userType === 'dono'`.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-shelby-frontend && npm run build` — build de produção sem erros; rota `/barber/configuracoes` gerada como estática.
- [x] `cd barbearia-shelby-frontend && npx eslint src` — sem erros (substituto de `npm run lint`, quebrado no Next 16 desde o Epic 1).

#### Manual Verification
- [x] Logado como `dono`: `/barber/configuracoes` carrega, mostra os 7 dias com os horários atuais; editar um dia e salvar reflete em `GET /api/business-hours` (confirmado via reload real da página); adicionar um feriado e vê-lo na lista; remover um feriado e vê-lo sumir. Confirmado via walkthrough real no navegador (Chromium/Puppeteer, sessão real com login via formulário e localStorage do app), 24/24 verificações automatizadas de navegador passando.
- [x] Logado como `barbeiro` ou `admin`: acessar `/barber/configuracoes` diretamente pela URL redireciona (não mostra o formulário); o link "Configurações" não aparece no header desses papéis. Confirmado via navegador real para os dois papéis.
- [x] Deslogado (visitante): acessar `/barber/configuracoes` redireciona para `/Login` (mesmo comportamento do restante de `/barber`). Confirmado via navegador real.
- [x] Regra transversal: `/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`, `/meus-servicos` continuam acessíveis normalmente (HTTP 200) para visitante, sem nenhuma mudança de comportamento. Confirmado via navegador real (7/7 rotas).

---

## Testing Notes
- Unit tests: não há suíte de testes de backend hoje (nenhum `*.test.ts` no repo) — não introduzida por este plano (fora de escopo pedido).
- Integration tests: idem, não há suíte de integração hoje.
- Manual steps: 1) `npx prisma migrate dev` + `npm run seed` no backend; 2) `npm run dev` no backend; 3) `npm run dev` no frontend; 4) login como `dono` (seed: `admin@barbearia.com` / senha do seed) para testar a página de configurações e as rotas restritas; 5) usar `POST /api/appointments` (curl/Postman ou o próprio wizard) para validar rejeição por horário/feriado.

## Migration Notes
- Projeto usa **Prisma 7**. Fluxo: (1) editar `prisma/schema.prisma`; (2) `npx prisma migrate dev --name add_business_hours_and_holiday`; (3) revisar o SQL gerado em `prisma/migrations/<timestamp>_add_business_hours_and_holiday/migration.sql` — deve conter só `CREATE TABLE`, sem `DROP`/`ALTER` destrutivo; (4) commitar `schema.prisma` + a nova pasta em `migrations/` juntos.
- Ambas as tabelas são novas — não há coluna `NOT NULL` sendo adicionada a uma tabela existente com dados, então nenhuma das regras de expand/contract de `DEPLOY_NORTHFLANK.md` (default obrigatório, rename indireto) se aplica aqui. Se o script gerado contiver qualquer `DROP`/`ALTER` inesperado em tabela existente, a execução deste plano deve parar e reportar antes de aplicar (ver regra de migration destrutiva do processo de implementação).
- Em produção, `npm run migrate` (`prisma migrate deploy`) roda no pipeline de deploy — a nova migration é aplicada automaticamente; nenhuma ação manual adicional é necessária além do deploy coordenado normal.

## Rollout Notes
- Mudança de contrato de API aditiva: 2 grupos de rotas novos (`/api/business-hours`, `/api/holidays`), restritos a `DONO`. Nenhum endpoint existente muda de formato de request/response. `POST /api/appointments`/`PATCH /api/appointments/:id` ganham um novo motivo possível de rejeição 400 (fora do horário configurado / feriado), mas a estrutura da resposta de erro (`{ error: string }`) já é a mesma usada hoje para os outros 400 desse mesmo endpoint — o frontend já sabe exibir esse formato sem mudança.
- Sinalizar ao usuário: rotas novas entre os dois repos (regra do `CLAUDE.md` raiz), mesmo sendo aditivas.
