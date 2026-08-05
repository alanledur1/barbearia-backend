# Configurações do admin: parâmetros de auditoria e filas — Implementation Plan

## Overview
Criar a infraestrutura mínima de auditoria (tabela `AuditLog` + parâmetros `AuditSettings`) e de
jobs agendados (`JobConfig` + gerenciador em cima de `node-cron`, já instalado) que hoje não existem
no projeto, e expor uma página nova `/barber/configuracoes/sistema`, visível **só** para o papel
`ADMIN`, para configurar esses parâmetros. `DONO` continua vendo só Horário/Feriados. Como primeiro
uso real da fila, revive `appointmentReminder.ts` (hoje comentado) usando o `EmailService` real do
Epic 10 em vez do canal WhatsApp morto, e adiciona um segundo job (`auditLogCleanup`) que aplica a
retenção configurada apagando `AuditLog` antigo.

## Scope
### In Scope
- 3 models novos no Prisma (`AuditLog`, `AuditSettings`, `JobConfig`), 100% aditivos.
- Migration SQL escrita à mão (sem acesso a Postgres nesta sessão — ver "Migration Notes").
- Captura de auditoria (chamada explícita, não interceptor genérico) em `userService` (create/update),
  `businessHoursService` (updateBulk), `holidayService` (create/delete), `planService`
  (create/update), condicionada a `AuditSettings.enabledModules`.
- Rotas novas `/api/admin-settings/*`, `requireRole('ADMIN')` (só admin): audit settings
  (GET/PUT), audit log viewer simples (GET, últimas N entradas), jobs (GET all, PUT por `jobKey`).
- `schedulerManager` (registro em memória de tarefas `node-cron`, bootstrap na subida, reschedule
  sob demanda).
- `appointmentReminder.ts` reescrito (deixa de auto-registrar cron; vira função chamada pelo
  scheduler manager) usando `EmailService.sendAppointmentReminder` (método novo).
- `auditLogCleanup.ts` novo (apaga `AuditLog` mais velho que `retentionDays`).
- Frontend: `barber/configuracoes/sistema` (page + layout + SCSS + hook), link condicional em
  `barber/configuracoes/page.tsx` visível só para `admin`.

### Out of Scope
- Redis/BullMQ ou qualquer fila distribuída.
- Viewer de audit log com filtro/busca/exportação/paginação avançada — só lista simples das
  últimas N entradas.
- Novos jobs além de `appointmentReminder` e `auditLogCleanup`.
- Reativar WhatsApp (`whatsappService.ts` continua comentado/morto).
- Qualquer mudança de comportamento para `DONO`, `BARBEIRO`, `CLIENTE` ou visitante.
- Auditoria de login/logout e de `admin.routes.ts` (CRUD de contas `ADMIN`).
- Testes automatizados novos (Jest/Cypress) — mesma lacuna pré-existente do projeto, não coberta
  neste epic (decisão herdada, documentada no PRD §5.6).
- Aplicar a migration contra um banco real (ambiente desta sessão não tem Postgres acessível nem
  rede para o registry — ver "Migration Notes").

## Current State (from codebase)
- `barbearia-backend/prisma/schema.prisma` — schema ativo (confirmado no Epic 10); sem `AuditLog`,
  `AuditSettings`, `JobConfig` hoje.
- `barbearia-backend/src/schedulers/appointmentReminder.ts:1-43` — bloco inteiro comentado, nunca
  importado.
- `barbearia-backend/src/routes/user.routes.ts:12,14-15` — `POST /`, `PUT /:id`, sem auditoria.
- `barbearia-backend/src/routes/businessHours.routes.ts:12` — `PUT /`, sem auditoria.
- `barbearia-backend/src/routes/holiday.routes.ts:12-13` — `POST /`, `DELETE /:id`, sem auditoria.
- `barbearia-backend/src/routes/plan.routes.ts:14-15` — `POST /`, `PUT /:id`, sem auditoria.
- `barbearia-backend/src/notifications/email.service.ts` — `EmailService` real (Epic 10), com
  `sendAppointmentConfirmation` como padrão de referência para `sendAppointmentReminder`.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/page.tsx` — só Horário + Feriados;
  guard (`layout.tsx:6`) já `allowedUserType={['dono','admin']}` (não muda).
- `barbearia-shelby-frontend/src/context/AuthContext.tsx:7` — `UserType` já inclui `'admin'`.
- Ambiente de execução desta sessão: sandbox Linux isolado, sem Postgres acessível
  (`DATABASE_URL` aponta pra `localhost:5432`, porta fechada) e sem rede de saída para o registry
  npm (`registry.npmjs.org` retorna 403 `blocked-by-allowlist`; `npx prisma generate` trava
  indefinidamente — confirmado via teste direto, `timeout 40s` estourado 3x mesmo com
  `CHECKPOINT_DISABLE=1`). **Decisão de implementação**: as 3 tabelas novas são acessadas via
  `prisma.$queryRaw`/`prisma.$executeRaw` (tagged template, parametrizado — sem risco de SQL
  injection) em vez de client tipado, porque o `@prisma/client` gerado em
  `node_modules/.prisma/client` não pode ser regenerado nesta sessão para incluir os models novos;
  usar a API tipada quebraria `npm run build` (tsc) sem uma forma de corrigir localmente. Raw query
  não depende do client gerado, então o build permanece limpo. Documentado como decisão tática, não
  como problema a resolver — funciona da mesma forma depois que `npx prisma generate` rodar num
  ambiente com rede (não requer nenhuma mudança de código).

## Desired End State
- `ADMIN` logado abre `/barber/configuracoes`, vê um link "Sistema" (que `DONO` não vê), acessa
  `/barber/configuracoes/sistema`, define retenção de auditoria + módulos habilitados, vê as
  últimas entradas do audit log, habilita/edita a expressão cron dos jobs `appointmentReminder` e
  `auditLogCleanup`.
- Uma ação administrativa (ex.: criar usuário) com o módulo `USERS` habilitado gera uma linha nova
  em `AuditLog`; com o módulo desabilitado, não gera.
- `npm run build` limpo nos dois repos; `npm run lint` limpo no frontend.
- Migration criada e documentada, pronta para ser aplicada (`npx prisma migrate deploy` ou
  `npx prisma migrate dev`) por quem tiver acesso a um Postgres real — não aplicada nesta sessão.

## References
- PRD: `barbearia-backend/SDD/PRD/2026-08-04-configuracoes-admin-auditoria-filas.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-08-04-configuracoes-admin-auditoria-filas.md`
- Key code references:
  - `barbearia-backend/src/notifications/email.service.ts` — padrão de método de email a replicar.
  - `barbearia-backend/src/services/holidayService.ts` — padrão de service com `CustomError`.
  - `barbearia-backend/src/schedulers/appointmentReminder.ts` — job morto a reviver.
  - `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` — padrão de hook a replicar.
  - `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx` — padrão de layout guard.

---

## Phase 1: Schema Prisma + Migration (backend)
### Tasks
- [x] Adicionar models `AuditLog`, `AuditSettings`, `JobConfig` em
      `barbearia-backend/prisma/schema.prisma` (só `CREATE TABLE`, nenhuma alteração em model
      existente).
- [x] Criar pasta de migration `barbearia-backend/prisma/migrations/20260804220000_add_audit_and_job_config/migration.sql`
      com `CREATE TABLE` x3 + `CREATE INDEX`/`CREATE UNIQUE INDEX` + `INSERT` idempotente
      (`ON CONFLICT DO NOTHING`) dos valores default de `AuditSettings` (id=1) e `JobConfig`
      (`appointmentReminder`, `auditLogCleanup`, ambos `enabled = false` por padrão — admin liga
      quando quiser).

### Success Criteria
#### Automated Verification
- [x] Revisão manual do `migration.sql`: confirmar que só existem `CREATE TABLE`/`CREATE INDEX`/
      `INSERT ... ON CONFLICT DO NOTHING` — nenhum `DROP`/`ALTER`/`RENAME` em tabela existente.
- [x] `schema.prisma` sintaticamente válido (revisão manual linha a linha — `npx prisma validate`
      não pôde ser executado nesta sessão pelo mesmo motivo de rede documentado em "Current State";
      ver "Migration Notes").

#### Manual Verification
- [ ] Rodar `npx prisma migrate deploy` (ou `migrate dev`) num ambiente com Postgres acessível e
      confirmar que a migration aplica sem erro e sem drift reportado.
- [ ] Rodar `npx prisma generate` no mesmo ambiente para atualizar o client tipado (não obrigatório
      para o funcionamento do código desta feature, que usa `$queryRaw`/`$executeRaw`, mas
      recomendado para manter o client em dia com o schema).

---

## Phase 2: Camada de Auditoria (backend)
### Tasks
- [x] Criar `barbearia-backend/src/services/auditService.ts` — `getSettings()`,
      `updateSettings()`, `isModuleEnabled()`, `log()` (nunca lança — falha de auditoria não pode
      quebrar a ação principal), `listRecent()`.
- [x] Editar `barbearia-backend/src/services/userService.ts` — `create()` e `update()` passam a
      receber `actor: { id, role }` como primeiro parâmetro e chamam `auditService.log(...)` após
      sucesso (`USER_CREATE`/`USER_UPDATE`, módulo `USERS`).
- [x] Editar `barbearia-backend/src/controllers/user.controller.ts` — `create`/`update` passam
      `{ id: req.user.id, role: req.user.role }` como ator (com guarda 401 se `req.user` ausente,
      mesmo padrão já usado em `update`).
- [x] Editar `barbearia-backend/src/services/businessHoursService.ts` — `updateBulk()` recebe
      `actor`, audita `BUSINESS_HOURS_UPDATE` (módulo `BUSINESS_HOURS`).
- [x] Editar `barbearia-backend/src/controllers/businessHours.controller.ts` — passa o ator.
- [x] Editar `barbearia-backend/src/services/holidayService.ts` — `create()`/`delete()` recebem
      `actor`, auditam `HOLIDAY_CREATE`/`HOLIDAY_DELETE` (módulo `HOLIDAYS`).
- [x] Editar `barbearia-backend/src/controllers/holiday.controller.ts` — passa o ator.
- [x] Editar `barbearia-backend/src/services/planService.ts` — `create()`/`update()` recebem
      `actor`, auditam `PLAN_CREATE`/`PLAN_UPDATE` (módulo `PLANS`).
- [x] Editar `barbearia-backend/src/controllers/plan.controller.ts` — passa o ator.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [ ] Com Postgres real e migration aplicada: criar um usuário via `POST /api/users` autenticado
      como `ADMIN` com módulo `USERS` habilitado → nova linha em `AuditLog` com `action=USER_CREATE`.
- [ ] Desabilitar o módulo `USERS` em `AuditSettings` → repetir a criação → nenhuma linha nova.

---

## Phase 3: Camada de Jobs/Filas (backend)
### Tasks
- [x] Criar `barbearia-backend/src/services/jobConfigService.ts` — `listAll()`, `getByKey()`,
      `update()` (valida `cron.validate`), `markRan()`.
- [x] Adicionar `EmailService.sendAppointmentReminder()` em
      `barbearia-backend/src/notifications/email.service.ts`, mesmo padrão de
      `sendAppointmentConfirmation` (assunto "Lembrete: seu agendamento é amanhã").
- [x] Reescrever `barbearia-backend/src/schedulers/appointmentReminder.ts` — exporta
      `runAppointmentReminderJob()` (sem auto-registrar cron), usa `EmailService.sendAppointmentReminder`
      no lugar de `sendWhatsappMessage`.
- [x] Criar `barbearia-backend/src/schedulers/auditLogCleanup.ts` — exporta
      `runAuditLogCleanupJob()`, deleta `AuditLog` mais antigo que `AuditSettings.retentionDays`.
- [x] Criar `barbearia-backend/src/schedulers/schedulerManager.ts` — `bootstrap()` (lê `JobConfig`,
      agenda os habilitados; try/catch para não derrubar o servidor se a tabela ainda não existir),
      `reschedule(jobKey)` (para/reagenda uma tarefa).
- [x] Editar `barbearia-backend/src/server.ts` — chama `bootstrap()` (fire-and-forget, com `.catch`)
      depois de `app.listen`.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [ ] Com Postgres real: habilitar `appointmentReminder` via API, confirmar no log do servidor que
      a tarefa é (re)agendada; com um agendamento `CONFIRMED` pra amanhã com email válido, rodar o
      job manualmente (ex.: script ad-hoc chamando `runAppointmentReminderJob()`) e confirmar
      envio (ou preview Ethereal, se `SMTP_HOST` não configurado).
- [ ] Habilitar `auditLogCleanup`, confirmar que `AuditLog` mais antigo que `retentionDays` é
      removido ao rodar `runAuditLogCleanupJob()`.

---

## Phase 4: API de configurações do admin (backend)
### Tasks
- [x] Criar `barbearia-backend/src/controllers/adminSettings.controller.ts` —
      `getAuditSettings`, `updateAuditSettings`, `listAuditLog`, `listJobs`, `updateJob` (este
      último chama `schedulerManager.reschedule(jobKey)` após persistir).
- [x] Criar `barbearia-backend/src/routes/adminSettings.routes.ts` — todas as rotas
      `authMiddleware` + `requireRole('ADMIN')` (só admin, diferente do padrão `DONO+ADMIN`).
- [x] Editar `barbearia-backend/src/routes/index.ts` — registrar
      `router.use('/admin-settings', adminSettingsRoutes)`.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros.
- [x] Revisão manual: todas as rotas novas usam `requireRole('ADMIN')` (não `'DONO','ADMIN'`).

#### Manual Verification
- [ ] Com Postgres real: `GET /api/admin-settings/audit` como `DONO` → 403. Como `ADMIN` → 200.
- [ ] `PUT /api/admin-settings/jobs/appointmentReminder` com cron inválido → 400.

---

## Phase 5: Frontend — página `/barber/configuracoes/sistema`
### Tasks
- [x] Criar `barbearia-shelby-frontend/src/hooks/useSystemSettings.tsx` — mesmo padrão de
      `useBusinessSettings.tsx` (fetch audit settings + audit log + jobs; `saveAuditSettings`,
      `saveJob`).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/configuracoes/sistema/layout.tsx` —
      `ProtectedRoute allowedUserType={['admin']}`.
- [x] Criar `barbearia-shelby-frontend/src/app/barber/configuracoes/sistema/page.tsx` — seção
      Auditoria (retenção + checkboxes de módulo + lista somente-leitura do log), seção Filas/Jobs
      (uma linha por job: toggle, cron, última execução).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/configuracoes/sistema/Sistema.module.scss` —
      reaproveita tokens de `Configuracoes.module.scss` (`$card-bg`, `$border-color`,
      `$text-color`, `$text-muted`, `$brand-color`, `$input-bg`, `%button-base`).
- [x] Editar `barbearia-shelby-frontend/src/app/barber/configuracoes/page.tsx` — importa
      `useAuth`, adiciona seção/link "Sistema" visível só quando `auth.user?.userType === 'admin'`.
- [x] Editar `barbearia-shelby-frontend/src/app/barber/configuracoes/Configuracoes.module.scss` —
      classe nova `.systemLink` (`@extend %button-base`, `display: inline-block`,
      `text-decoration: none`) para o link estilizado como botão.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-shelby-frontend && npm run build` — build sem erros (rota
      `/barber/configuracoes/sistema` aparece no output do build).
- [x] `cd barbearia-shelby-frontend && npm run lint` — sem erros novos.

#### Manual Verification
- [ ] Login como `admin.sistema@barbearia.com` (seed) → `/barber/configuracoes` mostra o link
      "Sistema" → acessa `/barber/configuracoes/sistema` → vê as duas seções.
- [ ] Login como `DONO` (`admin@barbearia.com`, seed) → `/barber/configuracoes` **não** mostra o
      link → acesso direto à URL redireciona pra `/Login`.
- [ ] Login como `BARBEIRO`/`CLIENTE` → sem acesso a `/barber/configuracoes*` (comportamento já
      existente, confirmar que não regrediu).

---

## Testing Notes
- Unit tests: nenhum criado (fora de escopo — projeto não tem suíte para as rotas de configuração
  irmãs, ex. `businessHours`/`holiday`/`plan`; decisão de manter consistência, documentada no PRD).
- Integration tests: nenhum criado, mesmo motivo.
- Manual steps: 1) aplicar a migration da Phase 1 num Postgres real; 2) `npm run dev` no backend;
  3) `npm run dev` no frontend; 4) percorrer os checklists de Manual Verification acima logado como
  `admin.sistema@barbearia.com` (seed existente) e depois como `admin@barbearia.com` (`DONO`, seed
  existente) para confirmar a distinção de acesso.

## Migration Notes
- Projeto usa **Prisma 7**. Fluxo normal: (1) editar `prisma/schema.prisma`; (2)
  `npx prisma migrate dev --name add_audit_and_job_config` (gera + aplica localmente); (3) revisar
  o SQL gerado (sem `DROP`/`ALTER` destrutivo); (4) `npx prisma migrate deploy` em produção.
- **Nesta sessão**: `npx prisma migrate dev` não pôde ser usado porque não há Postgres acessível
  (`DATABASE_URL` aponta pra `localhost:5432`, porta fechada no sandbox) — o comando exige conexão
  ativa mesmo em modo `--create-only`. A migration foi **escrita à mão**
  (`prisma/migrations/20260804220000_add_audit_and_job_config/migration.sql`), seguindo
  exatamente o formato que o Prisma gera (mesmo estilo de `CREATE TABLE`/`CREATE INDEX` das
  migrations existentes no repo, ex. `20260801133458_add_plans_and_subscriptions`), e contém
  **apenas** operações aditivas (`CREATE TABLE` x3, `CREATE INDEX`/`CREATE UNIQUE INDEX` x3,
  `INSERT ... ON CONFLICT DO NOTHING` para os valores default) — nenhum `DROP`/`ALTER`/`RENAME` em
  tabela existente, portanto **sem risco de operação destrutiva**. Fica pendente para quem tiver
  acesso a um Postgres real rodar `npx prisma migrate deploy` (aplica o diretório de migration
  como está, sem gerar diff novo) ou `npx prisma migrate dev` (que deve reconhecer a migration já
  escrita e não tentar gerar outra, desde que o hash bata — se o Prisma reclamar de drift por
  qualquer motivo, revisar antes de aplicar).
- `npx prisma generate` também não pôde ser executado nesta sessão (trava indefinidamente tentando
  acessar rede, mesmo com `CHECKPOINT_DISABLE=1` — confirmado por teste direto). Por isso as 3
  tabelas novas são acessadas via `prisma.$queryRaw`/`prisma.$executeRaw` no código desta feature
  (ver "Current State"), que não depende do client regenerado. Recomendado rodar
  `npx prisma generate` assim que possível para manter o client em dia, mas não é bloqueante.

## Rollout Notes
- Todos os jobs (`appointmentReminder`, `auditLogCleanup`) nascem com `enabled = false` na seed da
  migration — precisa que um `ADMIN` habilite explicitamente pela UI depois do deploy. Evita que o
  lembrete de agendamento comece a disparar emails em produção sem configuração intencional.
- `AuditSettings` nasce com todos os módulos habilitados (`USERS,BUSINESS_HOURS,HOLIDAYS,PLANS`) e
  retenção de 90 dias — captura auditoria desde o primeiro deploy sem exigir configuração manual.
