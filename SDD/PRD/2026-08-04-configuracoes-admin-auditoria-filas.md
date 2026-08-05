# PRD — Página de configurações do admin com parâmetros de auditoria (log de ações administrativas) e de filas/jobs do sistema, visível apenas ao papel admin

## 1) Objetivo
- Dar ao papel `ADMIN` (não `DONO`) uma seção nova, exclusiva, dentro da área de Configurações,
  com dois blocos de parâmetros que hoje não existem no projeto: **auditoria** (log de ações
  administrativas + parâmetros como retenção em dias e módulos habilitados) e **filas/jobs**
  (configuração de jobs agendados, reaproveitando `node-cron` já instalado).
- Fecha a lacuna descrita no `ROADMAP_V3.md`: não existe tabela de audit log, não existe lib de
  fila, e o único scheduler do projeto (`appointmentReminder.ts`) está inteiro comentado e não é
  importado em lugar nenhum — WhatsApp e lembrete de agendamento estão 100% inativos.
- Cria a infraestrutura mínima (captura de auditoria nas ações administrativas já protegidas por
  `requireRole`, e uma camada de configuração de job agendado) necessária para a página de
  configuração existir e ter efeito real, não apenas ser uma tela decorativa.

## 2) Escopo
**Inclui**
- Backend: tabela `AuditLog` (append-only) + tabela `AuditSettings` (linha única de config:
  retenção em dias, módulos habilitados) + tabela `JobConfig` (config de jobs agendados:
  habilitado, expressão cron, última execução).
- Captura de auditoria (chamada explícita a um `auditService.log(...)`, não um interceptor Express
  genérico) nas ações de escrita já protegidas por `requireRole('DONO','ADMIN')` mapeadas em:
  `user.routes.ts` (create/update de usuário), `businessHours.routes.ts` (updateBulk),
  `holiday.routes.ts` (create/delete), `plan.routes.ts` (create/update) — condicionada ao módulo
  correspondente estar habilitado em `AuditSettings.enabledModules`.
- Endpoints novos, **`requireRole('ADMIN')` apenas** (não `DONO`): ler/atualizar `AuditSettings`,
  listar as últimas entradas de `AuditLog` (viewer simples, somente leitura, sem filtro/busca —
  MVP), listar/atualizar `JobConfig` por job.
- Scheduler mínimo: um módulo gerenciador que lê `JobConfig` do banco na subida do servidor e
  registra/atualiza tarefas `node-cron` dinamicamente (start/stop) conforme `enabled` +
  `cronExpression` de cada linha — sem Redis/BullMQ.
- Reaproveitamento do `EmailService` (Epic 10) como primeiro caso de uso real da fila: revive
  `appointmentReminder.ts` como job configurável via `JobConfig` (`jobKey = 'appointmentReminder'`),
  trocando o canal morto (WhatsApp, `sendWhatsappMessage`, comentado) por email real
  (`EmailService.sendAppointmentReminder`, método novo, mesmo padrão de
  `sendAppointmentConfirmation`).
- Segundo job novo, `jobKey = 'auditLogCleanup'`, que aplica a retenção configurada em
  `AuditSettings.retentionDays` apagando `AuditLog` mais antigo que o limite — dá função real ao
  parâmetro de retenção (não é só um campo decorativo).
- Frontend: nova subrota `barber/configuracoes/sistema` (`page.tsx` + `layout.tsx` com
  `ProtectedRoute allowedUserType={['admin']}`), com as duas seções (Auditoria, Filas/Jobs) e o
  viewer simples do log. Link para essa subrota adicionado à página `barber/configuracoes/page.tsx`
  e à sidebar (`Sidebar.tsx`), visível somente quando `auth.user.userType === 'admin'`.

**Não inclui (fora de escopo)**
- Redis/BullMQ ou qualquer fila real distribuída — não há evidência de necessidade (volume do
  projeto é uma barbearia única); `node-cron` já instalado cobre o caso de uso.
- Viewer completo de audit log (filtros, busca, exportação, paginação avançada) — só uma listagem
  simples das últimas N entradas (MVP conforme nota do roadmap: "se o viewer for trivial de
  incluir, avaliar" — decidido incluir por ser praticamente gratuito ao lado do endpoint de
  listagem que a Automated Verification já precisa).
- Novos jobs além dos dois listados (`appointmentReminder`, `auditLogCleanup`) — WhatsApp continua
  fora de escopo (client `whatsapp-web.js` seguiria exigindo sessão de navegador autenticada, não é
  reativado aqui).
- Qualquer mudança de comportamento para `DONO`: continua vendo só Horário de Funcionamento e
  Feriados em `/barber/configuracoes`, sem a nova seção nem o link para `/barber/configuracoes/sistema`.
- Qualquer mudança de comportamento para `BARBEIRO`, `CLIENTE` ou visitante.
- Auditoria de ações de leitura (GET) — só ações de escrita (create/update/delete) geram entrada.
- Auditoria de login/logout ou de `admin.routes.ts` (CRUD de contas ADMIN) — não estão na lista de
  superfícies do roadmap para este epic; ficam fora para não expandir escopo.

## 3) Fluxo atual (como funciona hoje)
Não existe nenhuma peça desta feature hoje:
- `prisma/schema.prisma` não tem `AuditLog`, `AuditSettings` nem `JobConfig`.
- `src/schedulers/appointmentReminder.ts` está inteiro comentado (bloco `/* ... */`) e nunca é
  importado em `src/app.ts` nem `src/server.ts` — `node-cron` (`^4.2.1`, `package.json:55`) está
  instalado mas sem nenhum uso ativo no código (`grep` por `node-cron|cron.schedule` só retorna
  esse arquivo comentado).
- `barbearia-shelby-frontend/src/app/barber/configuracoes/page.tsx` tem só duas seções: "Horário de
  Funcionamento" e "Feriados / Bloqueios" (via hook `useBusinessSettings`). O guard
  (`configuracoes/layout.tsx:6`) já é `allowedUserType={['dono', 'admin']}` — ambos os papéis veem
  a página inteira hoje, sem distinção.
- As 4 rotas candidatas a gerar auditoria já existem e já são protegidas por
  `requireRole('DONO', 'ADMIN')`, mas nenhuma delas registra quem fez o quê:
  - `user.routes.ts:12-15` — `POST /api/users` (create), `PUT /api/users/:id` (update).
  - `businessHours.routes.ts:12` — `PUT /api/business-hours` (updateBulk, substitui as 7 linhas).
  - `holiday.routes.ts:12-13` — `POST /api/holidays` (create), `DELETE /api/holidays/:id` (delete).
  - `plan.routes.ts:14-15` — `POST /api/plans` (create), `PUT /api/plans/:id` (update).
- Os controllers dessas rotas (`user.controller.ts`, `businessHours.controller.ts`,
  `holiday.controller.ts`, `plan.controller.ts`) têm acesso a `req.user` (`{ id, role, email }`,
  populado por `auth.middleware.ts:39-43`), mas hoje só `user.controller.ts:62`
  (`this.service.update(req.user.id, id, req.body)`) de fato usa isso — os demais controllers
  ignoram `req.user`.
- `EmailService` (`src/notifications/email.service.ts`, criada no Epic 10) já expõe
  `sendPasswordResetOtp`, `sendAppointmentConfirmation` e `sendWelcomeEmail`, todos seguindo o
  mesmo padrão: `transporter` via `getTransporter()` (SMTP real se `SMTP_HOST` setado, senão
  fallback Ethereal), `getFromAddress()`, e um método público por tipo de email.

## 4) Fluxo desejado (comportamento esperado)
- Um usuário `ADMIN` autenticado acessa `/barber/configuracoes` e vê, além de Horário/Feriados
  (iguais ao que `DONO` vê), um link/seção extra "Sistema" levando a
  `/barber/configuracoes/sistema`. Um usuário `DONO` autenticado não vê esse link nem consegue
  acessar a subrota (redirect para `/Login`, mesmo padrão do `ProtectedRoute`).
- Em `/barber/configuracoes/sistema`, o `ADMIN` vê e edita:
  - **Auditoria**: retenção em dias (numérico) e quais módulos geram log (checkboxes: Usuários,
    Horário de Funcionamento, Feriados, Planos); mais uma lista somente-leitura das últimas
    entradas do audit log (quem, quando, ação, entidade).
  - **Filas/Jobs**: uma linha por job configurável (`appointmentReminder`, `auditLogCleanup`) com
    toggle habilitado/desabilitado, expressão cron editável, e a última execução (`lastRunAt`), se
    houver.
- Ao salvar Auditoria, `PUT /api/admin-settings/audit` persiste `retentionDays`/`enabledModules`;
  as próximas ações de escrita nas 4 rotas mapeadas só geram `AuditLog` se o módulo correspondente
  estiver em `enabledModules`.
- Ao salvar um job (`PUT /api/admin-settings/jobs/:jobKey`), o backend valida a expressão cron
  (`cron.validate`), persiste em `JobConfig`, e re-registra a tarefa `node-cron` em memória
  (para/começa conforme `enabled`) sem precisar reiniciar o servidor.
- Com `appointmentReminder` habilitado, todo dia no horário configurado o job busca agendamentos
  `CONFIRMED` do dia seguinte com email conhecido (cliente ou guest) e envia um email de lembrete
  via `EmailService.sendAppointmentReminder`; atualiza `JobConfig.lastRunAt` ao final.
- Com `auditLogCleanup` habilitado, o job apaga linhas de `AuditLog` mais antigas que
  `AuditSettings.retentionDays` dias; atualiza `lastRunAt`.
- Nenhuma mudança de comportamento para `DONO`, `BARBEIRO`, `CLIENTE` ou visitante em nenhuma
  outra página/rota do sistema.

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-backend/src/routes/user.routes.ts` — `POST /`, `PUT /:id`, alvo de auditoria.
- `barbearia-backend/src/routes/businessHours.routes.ts` — `PUT /`, alvo de auditoria.
- `barbearia-backend/src/routes/holiday.routes.ts` — `POST /`, `DELETE /:id`, alvo de auditoria.
- `barbearia-backend/src/routes/plan.routes.ts` — `POST /`, `PUT /:id`, alvo de auditoria.
- `barbearia-backend/src/routes/index.ts` — monta todos os routers em `/api/*`; nova rota
  `admin-settings` precisa ser registrada aqui (`router.use('/admin-settings', adminSettingsRoutes)`).
- **Nova**: `barbearia-backend/src/routes/adminSettings.routes.ts` — `GET/PUT /audit`,
  `GET /audit-log`, `GET/PUT /jobs`, todas `requireRole('ADMIN')` (só admin, diferente do padrão
  `DONO+ADMIN` usado nas outras rotas de configuração).
- `barbearia-shelby-frontend/src/app/barber/configuracoes/page.tsx` — ganha um link condicional
  para a nova subrota (só quando `auth.user?.userType === 'admin'`).
- **Nova**: `barbearia-shelby-frontend/src/app/barber/configuracoes/sistema/page.tsx` +
  `layout.tsx` (guard `allowedUserType={['admin']}`).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/Sidebar.tsx:27-36` — item de
  navegação "Configurações" já aponta pra `/barber/configuracoes`; não precisa de item novo na
  sidebar (o link "Sistema" fica dentro da própria página de Configurações, evitando redundância).

### 5.2 Domínio / Regras / Serviços
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — reusado sem alteração,
  `requireRole('ADMIN')` (só um papel) já é suportado pela assinatura `...roles: string[]`.
- `barbearia-backend/src/services/userService.ts` — `create()` (linha 69) não recebe `actorId`
  hoje; `update()` (linha 100) já recebe `actorId` (usado para bloquear auto-edição, não para
  auditoria). Ambos precisam dar um retorno utilizável para o controller montar a entrada de
  auditoria (ou o próprio service chama `auditService.log`).
- `barbearia-backend/src/services/businessHoursService.ts` — `updateBulk()` (linha 18) não recebe
  actor.
- `barbearia-backend/src/services/holidayService.ts` — `create()`/`delete()` não recebem actor.
- `barbearia-backend/src/services/planService.ts` — `create()`/`update()` não recebem actor.
- **Nova**: `barbearia-backend/src/services/auditService.ts` — `log(actor, action, entity, entityId, metadata?)`
  (escreve em `AuditLog` se o módulo estiver habilitado em `AuditSettings`), `listRecent(limit)`,
  `getSettings()`, `updateSettings(data)`.
- **Nova**: `barbearia-backend/src/services/jobConfigService.ts` — `listAll()`,
  `updateJob(jobKey, data)` (valida cron com `node-cron`, persiste, delega ao scheduler manager
  para re-registrar a tarefa).
- **Nova**: `barbearia-backend/src/schedulers/schedulerManager.ts` — registro em memória
  (`Map<string, ScheduledTask>`) das tarefas `node-cron` ativas; `bootstrap()` (lido na subida do
  servidor a partir de `JobConfig`), `reschedule(jobKey)` (para a tarefa antiga se existir e cria
  uma nova conforme o `JobConfig` atual).
- `barbearia-backend/src/schedulers/appointmentReminder.ts` — reescrito: deixa de se
  auto-registrar via `cron.schedule` no import; passa a exportar uma função `runAppointmentReminderJob()`
  chamada pelo `schedulerManager`, usando `EmailService.sendAppointmentReminder` em vez de
  `sendWhatsappMessage` (que continua comentado/morto).
- **Nova**: `barbearia-backend/src/schedulers/auditLogCleanup.ts` — exporta
  `runAuditLogCleanupJob()`, delete de `AuditLog` mais antigo que `AuditSettings.retentionDays`.

### 5.3 Persistência / Modelos / Migrações
- `prisma/schema.prisma` (raiz do backend — confirmado como o schema ativo pelo Epic 10; o arquivo
  `src/prisma/schema.prisma` é legado/morto, sem uso pelo Prisma CLI) ganha 3 models novos,
  puramente aditivos (sem alterar nenhum model existente):
  - `AuditLog`: `id`, `actorId` (Int, sem FK — snapshot, não relação, para sobreviver a eventual
    exclusão do usuário ator), `actorName` (String, snapshot), `actorRole` (String, snapshot),
    `action` (String), `entity` (String), `entityId` (String?), `metadata` (Json?), `createdAt`
    (DateTime, default now). Índices em `createdAt` e `entity`.
  - `AuditSettings`: linha única (`id` fixo = 1 por convenção de aplicação, sem enum/tabela de
    singleton no Prisma), `retentionDays` (Int, default 90), `enabledModules` (String[], default
    todos os módulos), `updatedAt`.
  - `JobConfig`: `id`, `jobKey` (String, `@unique`), `enabled` (Boolean, default false),
    `cronExpression` (String), `lastRunAt` (DateTime?), `updatedAt`.
- **Migration**: ambiente de execução desta sessão não tem acesso a Postgres (`DATABASE_URL` aponta
  pra `localhost:5432`, porta fechada no sandbox — mesma limitação documentada no Epic 10) nem
  acesso de rede ao registry — `npx prisma migrate dev` não pode ser executado de forma
  interativa/gerando diff automático contra um banco real nesta sessão. A migration SQL será
  escrita manualmente seguindo o padrão das migrations existentes (100% `CREATE TABLE`, sem
  `ALTER`/`DROP` em tabelas existentes — logo, não há risco de operação destrutiva), documentada no
  Plan como uma fase que o usuário aplica localmente (`npx prisma migrate dev` ou
  `npx prisma migrate deploy`) quando tiver Postgres disponível.
- `prisma/seed.ts` (ativo, não `src/prisma/seed.ts` que é o script realmente referenciado por
  `package.json:20` como `ts-node src/prisma/seed.ts` — checar location exata na fase de plano) já
  cria um usuário `ADMIN` (`admin.sistema@barbearia.com`) — suficiente para validação manual sem
  precisar de seed novo.

### 5.4 Integrações externas (clients/adapters/providers)
- `node-cron` (`^4.2.1`, já instalado) — `cron.schedule(expression, fn)` retorna um `ScheduledTask`
  com `.stop()`; `cron.validate(expression)` valida a expressão sem agendar. Ambos síncronos.
- `EmailService` (`src/notifications/email.service.ts`) — reutilizado, ganha um método novo
  `sendAppointmentReminder(to, data)` seguindo o padrão de `sendAppointmentConfirmation` (mesmo
  helper `formatDateBR`, mesmo template visual).

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — reusado sem
  alteração estrutural, só `allowedUserType={['admin']}` no novo layout.
- `barbearia-shelby-frontend/src/context/AuthContext.tsx` — `UserType` já inclui `'admin'`, sem
  alteração.
- `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` — padrão de referência para o hook
  novo (`useSystemSettings` ou nome similar): `api` (axios) com header `Authorization` via
  `auth.token`, `extractErrorMessage`, `loading`/`error` state.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/Configuracoes.module.scss` — paleta/
  tokens SCSS a reaproveitar no módulo novo (`$card-bg`, `$border-color`, `$text-color`,
  `$text-muted`, `$brand-color`, `$input-bg`, `%button-base`).

### 5.6 Testes / Fixtures (se existirem)
- Não há testes automatizados (Jest/Cypress) cobrindo `configuracoes/page.tsx`, `ProtectedRoute` ou
  rotas de configuração hoje (mesma lacuna já documentada no PRD do epic de acesso admin). Validação
  desta feature também será via build + revisão manual, não novos specs Jest/Cypress (fora de
  escopo criar suíte nova neste epic).

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — `requireRole(...roles)`, usar com
  um único papel (`requireRole('ADMIN')`) para as rotas novas.
- `barbearia-backend/src/utils/customErrors.ts` (`CustomError`) — usado em todos os services
  existentes para erros de validação/negócio (400/404/409); replicar nos services novos.
- `barbearia-backend/src/services/prisma.service.ts` (`export const prisma`) — client Prisma
  singleton, importado por todos os services; reusar sem criar novo client.
- `barbearia-backend/src/notifications/email.service.ts` — `EmailService`, `formatDateBR`,
  `getFromAddress`, `getTransporter` (fallback Ethereal automático); só adicionar método novo, não
  duplicar transporte.
- `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` — padrão de hook de configuração
  (fetch + save com headers de auth) a replicar para o hook novo de configurações de sistema.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx` +
  `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx` — padrão de `layout.tsx` fino só
  com `ProtectedRoute`, a replicar em `barber/configuracoes/sistema/layout.tsx`.
- `barbearia-backend/src/routes/plan.routes.ts` (comentário "Gestão (DONO/ADMIN): ... Precisa vir
  antes de '/:id'") — lembrete de cuidado com ordem de rotas Express ao adicionar `GET /audit-log`
  antes de rotas com parâmetro dinâmico, se aplicável.

## 7) Documentação externa (via Context7)
Ferramenta MCP Context7 (`resolve-library-id`/`query-docs`) não está disponível neste ambiente de
execução (não está na lista de ferramentas MCP habilitadas desta sessão). Documentação de
`node-cron` e `nodemailer` já haviam sido cobertas/validadas na prática pelo próprio código
existente do projeto (padrão replicado, não literatura nova):

### Consultas realizadas
| Library ID | Query | Resumo do resultado |
|------------|-------|---------------------|
| — | — | Context7 indisponível nesta sessão; uso de `node-cron`/`nodemailer` inferido diretamente do código já existente no repositório (`package.json`, `schedulers/appointmentReminder.ts` comentado, `notifications/email.service.ts`), que já reflete a API real dessas libs nas versões instaladas (`node-cron@^4.2.1`, `nodemailer@^7.0.5`). |

### Trechos relevantes
- **node-cron** (uso já existente no projeto, `schedulers/appointmentReminder.ts:1,7`):
  ```ts
  import cron from 'node-cron';
  cron.schedule('0 9 * * *', async () => { /* ... */ });
  ```
  API adicional necessária para este epic (mesma major version, comportamento síncrono padrão):
  `cron.validate(expression: string): boolean` e o retorno de `cron.schedule(...)` expõe `.stop()`.

## 8) Impactos prováveis (áreas afetadas)
- Backend — schema: 3 tabelas novas aditivas (`AuditLog`, `AuditSettings`, `JobConfig`).
- Backend — services existentes: `userService.ts`, `businessHoursService.ts`, `holidayService.ts`,
  `planService.ts` ganham parâmetro de ator e chamada a `auditService.log`.
- Backend — controllers existentes: `user.controller.ts`, `businessHours.controller.ts`,
  `holiday.controller.ts`, `plan.controller.ts` passam `req.user` para o service.
- Backend — novo: `auditService.ts`, `jobConfigService.ts`, `adminSettings.routes.ts`,
  `adminSettings.controller.ts`, `schedulerManager.ts`, `auditLogCleanup.ts`; `email.service.ts`
  ganha `sendAppointmentReminder`; `appointmentReminder.ts` reescrito (não auto-registra mais).
- Backend — bootstrap: `app.ts` ou `server.ts` precisa chamar `schedulerManager.bootstrap()` na
  subida (ponto de integração a confirmar na fase de plano).
- Frontend — nova subrota `barber/configuracoes/sistema` (page + layout + módulo SCSS + hook);
  `barber/configuracoes/page.tsx` ganha link condicional.

## 9) Critérios de aceitação
- [ ] `ADMIN` autenticado vê um link/seção "Sistema" em `/barber/configuracoes` e acessa
      `/barber/configuracoes/sistema` normalmente.
- [ ] `DONO` autenticado **não** vê esse link e, se navegar direto pra
      `/barber/configuracoes/sistema`, é redirecionado (mesmo comportamento de acesso negado do
      `ProtectedRoute`).
- [ ] `BARBEIRO`, `CLIENTE` e visitante continuam sem acesso a `/barber/configuracoes` e
      `/barber/configuracoes/sistema` (redirect pra `/Login`).
- [ ] Em "Sistema", `ADMIN` consegue ver e salvar `retentionDays` e `enabledModules` de auditoria
      (`PUT /api/admin-settings/audit` retorna 200 e persiste).
- [ ] Em "Sistema", `ADMIN` vê uma lista somente-leitura das últimas entradas do audit log.
- [ ] Uma ação administrativa em um módulo habilitado (ex.: criar usuário) gera uma entrada nova em
      `AuditLog` visível na listagem; a mesma ação com o módulo desabilitado em `enabledModules`
      não gera entrada.
- [ ] Em "Sistema", `ADMIN` consegue ver e alternar habilitado/desabilitado e editar a expressão
      cron dos jobs `appointmentReminder` e `auditLogCleanup` (`PUT /api/admin-settings/jobs/:jobKey`
      retorna 200, valida cron inválido com 400).
- [ ] Todas as rotas novas (`/api/admin-settings/*`) retornam 403 para `DONO`, `BARBEIRO`,
      `CLIENTE` e visitante (só `ADMIN` passa).
- [ ] Nenhuma rota/página pré-existente muda de comportamento para `DONO` (Horário/Feriados
      continuam funcionando exatamente como antes) nem para `BARBEIRO`/`CLIENTE`/visitante
      (`/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`,
      `/meus-servicos` inalterados).
- [ ] `npm run build` (backend) e `npm run build`/`npm run lint` (frontend) passam limpos.

## 10) Open Questions (bloqueios / dúvidas)
Nenhuma. Todas as decisões de modelagem (schema das 3 tabelas novas, endpoints, papel exclusivo
`ADMIN`, escopo do viewer, decisão de reaproveitar `EmailService` para o lembrete de agendamento e
de criar o segundo job de limpeza de retenção) foram resolvidas com base em evidência direta do
codebase (rotas já protegidas mapeadas, `EmailService` já existente e documentado, `node-cron` já
instalado e com um scheduler morto pronto para ser revivido) e nas notas explícitas do
`ROADMAP_V3.md` para este epic, que autorizam essas escolhas como opcionais/recomendadas em vez de
obrigatórias — não há ambiguidade que dependa de decisão externa ao que já está documentado.
