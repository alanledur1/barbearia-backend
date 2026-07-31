# PRD — CRUD de usuários (clientes, barbeiros, donos) restrito ao papel dono

## 1) Objetivo
- Dar ao dono uma superfície única (API + página no frontend) para criar, editar e desativar contas de `CLIENTE`, `BARBEIRO` e `DONO` — sem depender de `psql`/Prisma Studio manual nem dos endpoints fragmentados e não expostos no frontend que já existem hoje (`/api/admin`, `/api/clients`, `/api/auth/register`).
- Hoje a única forma de criar um barbeiro/dono/admin é via `POST /api/auth/register` (sem UI) ou editando `prisma/seed.ts` manualmente; não existe nenhuma forma de "desativar" um usuário (só exclusão definitiva, que hoje já existe via `/api/admin/:id` e `/api/clients/:id`, mas sem UI e sem distinguir "desativado" de "removido").
- Escopo de papel gerenciável por esta feature: `CLIENTE`, `BARBEIRO`, `DONO`. **Não inclui `ADMIN`** — decisão de negócio do roadmap ("dono não cria admin"), reforçada pelo fato de o Epic 5 (`ROADMAP_V2.md`) já reservar a página de configurações (que inclui esta) para acesso também de `admin`, tratando `admin` como um nível acima de `dono`.

## 2) Escopo
**Inclui**
- Novo campo `active` (Boolean, default `true`) no model `User` — permite representar "desativado" sem apagar o histórico de agendamentos associado (hoje `Appointment.clientId`/`adminId` já usam `ON DELETE SET NULL`, então excluir de fato já é possível sem violar FK, mas perde a referência; desativar preserva o vínculo e permite reativação).
- Bloqueio de login (`POST /api/login` → `AuthService.login`, caminho único de login para todos os papéis) para usuários com `active: false`.
- Novos endpoints REST, restritos a `authMiddleware` + `requireRole('DONO')` (só dono, não admin — ver seção 1):
  - `GET /api/users` — lista usuários com papel em `CLIENTE`/`BARBEIRO`/`DONO` (nunca `ADMIN`), com filtro opcional `?role=`.
  - `GET /api/users/:id`
  - `POST /api/users` — cria usuário com papel em `CLIENTE`/`BARBEIRO`/`DONO`.
  - `PUT /api/users/:id` — edita nome/email/telefone/papel/senha (opcional)/`active`.
- Nova página no frontend, `/barber/usuarios`, visível e acessível **apenas** para `dono` (mesmo padrão de guarda de `/barber/configuracoes`, Epic 2), com listagem (filtro por papel), formulário de criação, modal de edição e ação de desativar/reativar.
- Link de acesso à nova página a partir de `BarberHeader.tsx`, condicionado a `auth.user?.userType === 'dono'` (mesmo padrão do link "Configurações" já existente).
- Guarda de auto-proteção: o dono não pode desativar nem trocar o próprio papel através desta feature (evita lockout — só existe `requireRole('DONO')`, sem fallback de `ADMIN`, nestes novos endpoints).

**Não inclui (fora de escopo)**
- Gestão de `ADMIN` (criar, editar, desativar, ou sequer listar) — continua fora desta feature; os endpoints existentes `/api/admin`, `/api/admins` (alias duplicado, ver seção 3) e `/api/auth/register` (que já permitem `role: ADMIN` para atores `DONO`/`ADMIN`) não são alterados nem restringidos por esta execução.
- Acesso de `ADMIN` à nova página `/barber/usuarios` (fica para o Epic 5, conforme `ROADMAP_V2.md`).
- Exclusão definitiva (hard delete) de usuário através da nova página/endpoints — a nova feature só oferece "desativar/reativar" (`active`). Exclusão definitiva já existe via `/api/admin/:id` e `/api/clients/:id` (endpoints pré-existentes, não tocados) para quem precisar dela por outra via.
- Alteração de senha do próprio usuário logado (fluxo de "esqueci minha senha" já existe em `/EsqueciSenha`, inalterado).
- Qualquer mudança em `/api/clients/signup` (autocadastro público de cliente) — continua criando com `active: true` por padrão (comportamento herdado do default do schema).
- Paginação/busca textual na listagem (lista simples, como as demais páginas de `/barber`).

## 3) Fluxo atual (como funciona hoje)

### Backend
- **Model `User` único** (`prisma/schema.prisma`), com `role: UserRole` (`CLIENTE`/`BARBEIRO`/`DONO`/`ADMIN`). Não existe nenhum campo de "ativo/inativo" — todo usuário criado é implicitamente ativo para sempre, até ser deletado.
- **Criação de staff** (barbeiro/dono/admin): `POST /api/auth/register` ([auth.routes.ts:17](../../src/routes/auth.routes.ts), [auth.controller.ts:13-31](../../src/controllers/auth.controller.ts), [auth.service.ts:14-50](../../src/services/auth.service.ts)) — protegida por `authMiddleware` + `requireRole('DONO', 'ADMIN')`, validada por `createAdminSchema` ([admin.schemas.ts:4-12](../../src/schemas/admin.schemas.ts): `role` aceita `'BARBEIRO' | 'DONO' | 'ADMIN'`, senha mínima 8 caracteres). Sem UI no frontend hoje.
- **Criação de cliente**: `POST /api/clients/signup` ([client.routes.ts:20](../../src/routes/client.routes.ts), `ClientController.register`, `ClientService.register` em [clientService.ts:9-39](../../src/services/clientService.ts)) — **pública**, sem role, sempre cria `role: 'CLIENTE'`. Consumida pelo frontend em `CriarConta/page.tsx:17` (`api.post('/clients/signup', ...)`).
- **CRUD de staff** (papel != `CLIENTE`): `GET/PUT/DELETE /api/admin[s]/:id` e `GET /api/admin[s]` ([admin.routes.ts](../../src/routes/admin.routes.ts), `AdminController`/`AdminService` em [admin.controller.ts](../../src/controllers/admin.controller.ts)/[adminService.ts](../../src/services/adminService.ts)) — protegido por `requireRole('DONO', 'ADMIN')` (ambos os papéis, não só dono). **Sem rota de criação** (fica só em `/api/auth/register`). `update` bloqueia explicitamente atualização de senha (`if (dataToUpdate.password) return res.status(400)...`, [admin.controller.ts:66-72](../../src/controllers/admin.controller.ts)). Sem UI no frontend hoje.
  - **Nota de rota duplicada**: `adminRoutes` está montado em **dois** lugares — `app.use('/api/admins', adminRoutes)` em [app.ts:27](../../src/app.ts) (plural) e `router.use('/admin', adminRoutes)` dentro de `routes/index.ts:24` (montado sob `/api`, então singular `/api/admin`). Ambos funcionam de forma idêntica hoje; é um artefato pré-existente, documentado aqui como fato, não corrigido por esta feature.
- **CRUD genérico de usuário** (qualquer papel, apesar do nome "client"): `GET/PUT/DELETE /api/clients/:id` e `GET /api/clients` ([client.routes.ts:26-31](../../src/routes/client.routes.ts), `ClientController`/`ClientService`) — `listAll`/`delete` restritos a `requireRole('DONO', 'ADMIN')`; `getById`/`update` abertos a qualquer usuário autenticado, com checagem manual no controller (`if (req.user?.role === 'CLIENTE' && req.user.id !== clientId) return 403`, [clientController.ts:70-72](../../src/controllers/clientController.ts)) — ou seja, staff (barbeiro/dono/admin) pode ver/editar **qualquer** usuário por essa rota hoje, não só clientes. `ClientService.listAll`/`getById`/`update`/`delete` operam sobre `prisma.user.*` sem filtro de `role` ([clientService.ts:67-109](../../src/services/clientService.ts)).
- **Login único**: `POST /api/login` ([routes/index.ts:19](../../src/routes/index.ts), `UnifiedLoginController.login`) chama `AuthService.login(email, password)` ([auth.service.ts:52-90](../../src/services/auth.service.ts)) — busca por `email` em `prisma.user` **sem filtrar por `role`**, ou seja, é o caminho de login de **todos** os papéis (cliente incluído). Confirmado que o frontend (`Login/page.tsx:18`) chama `/login`, não `/clients/login`. `ClientService.login` ([clientService.ts:41-66](../../src/services/clientService.ts)) existe mas não é mais chamado por nenhum fluxo do frontend atual (rota `/api/clients/login` continua montada, porém órfã de uso real).
- **Seed** ([prisma/seed.ts](../../src/prisma/seed.ts)): cria 3 usuários fixos via `upsert` (`dono` = `admin@barbearia.com`, `admin.sistema@barbearia.com`, `barbeiro.exemplo@barbearia.com`) e as 7 linhas de `BusinessHours`. Não cria nenhum registro relacionado a "ativo/inativo" (campo não existe ainda).
- **FK de `Appointment` para `User`**: `Appointment.clientId` e `Appointment.adminId` usam `ON DELETE SET NULL` (confirmado em `prisma/migrations/20260730002447_rbac_user_unification/migration.sql:40-41`) — deletar um `User` hoje já é seguro no nível de banco (não quebra FK), mas apaga a referência ao agendamento histórico (o agendamento passa a não ter mais `client`/`admin` associado).

### Frontend
- Não existe nenhuma página, hook ou componente de gestão de usuários hoje (confirmado via busca por `usuarios`/`Usuarios`/`/admin`/`listAll` em `src/app`, `src/hooks`, `src/services` — nenhum resultado).
- `/barber/configuracoes` ([Epic 2](2026-07-30-configuracao-horario-funcionamento-feriados.md)) é o precedente mais recente e mais próximo: página nova sob `/barber`, com `layout.tsx` de guarda adicional `ProtectedRoute allowedUserType={['dono']}` ([configuracoes/layout.tsx](../../../barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx)), hook próprio (`useBusinessSettings.tsx`) seguindo o padrão `getHeaders`/`fetchAll`/tratamento de erro de `useBarberData.tsx`, e link condicional em `BarberHeader.tsx:51-55` (já existe, aponta para `/barber/configuracoes`).
- `EditServiceModel.tsx` ([EditServiceModel.tsx](../../../barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/EditServiceModel.tsx)) e `ConfirmationModal.tsx` ([ConfirmationModal.tsx](../../../barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/ConfirmationModal.tsx)) são os precedentes de modal (overlay + form controlado; confirmação de ação destrutiva) a reaproveitar para os modais de criar/editar usuário e confirmar desativação.
- `AuthContext.tsx` ([AuthContext.tsx](../../../barbearia-shelby-frontend/src/context/AuthContext.tsx)) expõe `user.userType` (`'cliente'|'barbeiro'|'dono'|'admin'`) e `token`.

## 4) Fluxo desejado (comportamento esperado)
- Dono acessa `/barber/usuarios` (link no `BarberHeader`, visível só para `dono`) e vê uma lista de usuários com papel `CLIENTE`, `BARBEIRO` ou `DONO` (nunca `ADMIN`), com indicação de status (ativo/desativado) e um filtro por papel.
- Dono clica em "Novo usuário", preenche nome/email/telefone/senha/papel (restrito a `CLIENTE`/`BARBEIRO`/`DONO`) e cria a conta. Email duplicado é rejeitado com mensagem clara (409, mesmo padrão já usado em outros pontos do sistema).
- Dono clica em "Editar" num usuário existente, altera nome/email/telefone/papel/senha (opcional — só troca se preenchido) e salva.
- Dono clica em "Desativar" num usuário ativo (com confirmação, reaproveitando `ConfirmationModal`) — o usuário passa a `active: false` e não consegue mais fazer login (`POST /api/login` retorna 401 com mensagem clara), mas seu histórico de agendamentos permanece intacto (nada é deletado). O botão vira "Reativar" para o mesmo usuário.
- Dono **não consegue** desativar a própria conta nem trocar o próprio papel através desta página/endpoints (proteção contra lockout, já que só `DONO` acessa esta feature).
- Sem nenhuma ação do dono, comportamento é idêntico ao atual: todo usuário existente (seed + já cadastrados) continua com `active: true` (valor padrão da migration) e login funciona normalmente — sem regressão.
- Barbeiro, admin, cliente e visitante não conseguem acessar `/barber/usuarios` nem os novos endpoints `/api/users*` (redirect/403/401, mesmo padrão de `/barber/configuracoes`).

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-backend/src/routes/index.ts` — monta os `Router` de cada área; local de montagem da nova rota `/users`.
- `barbearia-backend/src/routes/admin.routes.ts` + `admin.schemas.ts` (`updateAdminSchema`) — precedente de rota restrita a staff, mas com `requireRole('DONO', 'ADMIN')` (aqui a nova rota usa só `requireRole('DONO')`).
- `barbearia-backend/src/routes/auth.routes.ts` + `admin.schemas.ts` (`createAdminSchema`) — precedente de criação de staff com Zod + `validate.middleware.ts`.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx` — precedente exato de guarda `dono`-only aninhada, a replicar em `barber/usuarios/layout.tsx`.

### 5.2 Domínio / Regras / Serviços
- `barbearia-backend/src/services/adminService.ts` — precedente de `listAll`/`findById`/`update`/`delete` sobre `prisma.user`, com hashing de senha condicional em `update` ([adminService.ts:43-48](../../src/services/adminService.ts)) — padrão a reaproveitar para hashing na nova `userService.ts`.
- `barbearia-backend/src/services/clientService.ts` — precedente de `register` com checagem de email duplicado + `CustomError(409)` ([clientService.ts:16-23](../../src/services/clientService.ts)).
- `barbearia-backend/src/services/auth.service.ts` — `login` (linha 52-90) é o caminho único de autenticação de todos os papéis; ponto exato onde inserir a checagem de `active`.
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — `requireRole(...roles)`; a nova rota usa `requireRole('DONO')` isoladamente (mesmo padrão de assinatura já usado com múltiplos papéis em outras rotas).
- `barbearia-backend/src/utils/customErrors.ts` — `CustomError(message, statusCode, details?)`, reaproveitado para as novas validações (papel inválido, auto-desativação, email duplicado).

### 5.3 Persistência / Modelos / Migrações
- `barbearia-backend/prisma/schema.prisma` — `model User` (linhas 15-27): `id`, `name`, `email?`, `phone?`, `password`, `role: UserRole @default(CLIENTE)`, `createdAt`, `updatedAt`. **Precisa de um campo novo**: `active Boolean @default(true)`.
- **Migrations**: projeto usa **Prisma 7** (`npx prisma migrate dev`/`migrate deploy`). Migration mais recente: `20260730232349_add_business_hours_and_holiday` (Epic 2). A nova migration (`add_user_active_flag` ou similar) adiciona só uma coluna `NOT NULL DEFAULT true` a uma tabela existente — não é uma coluna `NOT NULL` **sem** default (permitido pelas regras de expand/contract do `barbearia-backend/CLAUDE.md`), não há `DROP`/`RENAME`. Baixo risco, mas ainda assim exige revisão do SQL gerado antes de aplicar (regra do processo).
- `barbearia-backend/prisma/migrations/20260730002447_rbac_user_unification/migration.sql:40-41` — confirma `ON DELETE SET NULL` nas FKs `Appointment.adminId`/`clientId` → `User.id` (deletar usuário não quebra FK; desativar é uma escolha de produto, não uma necessidade técnica de integridade referencial).
- `barbearia-backend/src/prisma/seed.ts` — cria os 3 usuários fixos; após a mudança de schema, os `upsert` continuam funcionando sem alteração (novo campo `active` usa o `@default(true)` do schema automaticamente quando omitido no `create`).

### 5.4 Integrações externas (clients/adapters/providers)
- Nenhuma integração externa nova.

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/app/barber/configuracoes/*` (Epic 2) — precedente completo e mais recente de página `dono`-only dentro de `/barber` (layout de guarda, hook de dados, formulário, SCSS module).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/EditServiceModel.tsx` + `EditServiceModal.module.scss` — precedente de modal de formulário (criar/editar).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/ConfirmationModal.tsx` — precedente de modal de confirmação de ação (a reaproveitar para confirmar desativação/reativação).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx:51-55` — já tem o padrão de link condicional a `dono` (para "Configurações"); o novo link "Usuários" segue exatamente o mesmo bloco.
- `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` — precedente mais recente de hook de dados `dono`-only (`getHeaders`, `fetchAll`, tratamento de erro via `err.response?.data?.error`).
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — guarda de rota reutilizável (`allowedUserType={['dono']}`).
- `barbearia-shelby-frontend/src/services/api.ts` — client axios único.

### 5.6 Testes / Fixtures (se existirem)
- Não há testes automatizados (`*.test.ts`/`*.spec.ts`/`*.cy.*`) cobrindo usuários, admin ou clientes em nenhum dos dois repositórios (mesmo achado dos Epics 1 e 2). Validação depende de build/lint limpos + walkthrough manual, como nos epics anteriores.

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-backend/src/services/adminService.ts` — hashing condicional de senha em update (`if (dataToUpdate.password) dataToUpdate.password = await bcrypt.hash(...)`).
- `barbearia-backend/src/services/clientService.ts::register` — checagem de email duplicado antes de criar (`findUnique` por email → `CustomError(409)` se existir) e captura de `P2002` no `create`/`update` (padrão usado em `holidayService.ts` do Epic 2) como camada extra de segurança.
- `barbearia-backend/src/schemas/admin.schemas.ts` — padrão de schema Zod com `body`/`params` separados, usado com `validate.middleware.ts`.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/*` — página `dono`-only completa (layout + hook + page + scss) a clonar como estrutura-base para `barber/usuarios/*`.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/{EditServiceModel,ConfirmationModal}.tsx` + `EditServiceModal.module.scss` — modais de formulário/confirmação prontos para adaptar.

## 7) Documentação externa (via Context7)
Feature é composta por: (a) uma coluna nova em uma tabela Prisma existente + queries `findMany`/`create`/`update` já usadas nos mesmos moldes em `adminService.ts`/`clientService.ts`/`businessHoursService.ts`; (b) rotas Express seguindo o padrão idêntico já em uso (`Router`, `authMiddleware`, `requireRole`); (c) formulário/modal React controlado com `useState`, igual ao já usado em `EditServiceModel.tsx`/`ConfirmationModal.tsx`. Nenhuma API nova de biblioteca é introduzida (mesmas versões de Prisma 7, Express 5, React 19, bcryptjs já em uso).

### Consultas realizadas
Nenhuma consulta ao Context7 foi necessária — mesma justificativa dos PRDs dos Epics 1 e 2: toda a implementação reusa APIs já utilizadas de forma idêntica em outros pontos do mesmo repositório.

### Trechos relevantes
- N/A.

## 8) Impactos prováveis (áreas afetadas)
- **Backend — schema**: um campo novo (`User.active`) em `prisma/schema.prisma` + migration aditiva (`ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true`).
- **Backend — auth**: `AuthService.login` ganha checagem de `active` (rejeita login de usuário desativado com 401 e mensagem clara) — afeta o caminho de login de **todos** os papéis (cliente incluído), já que é o único endpoint de login em uso.
- **Backend — API nova**: `userService.ts`, `user.controller.ts`, `user.routes.ts` novos, montados em `routes/index.ts` sob `/api/users`, restritos a `requireRole('DONO')` (só dono, diferente de `/api/admin` que aceita dono+admin).
- **Backend — endpoints existentes**: `/api/admin[s]`, `/api/clients`, `/api/auth/register` **não são alterados** por esta feature (ficam como estão, inclusive a duplicidade de rota `/api/admin` vs `/api/admins` documentada na seção 3).
- **Frontend — nova página**: `/barber/usuarios` (`dono`-only) com listagem, criação, edição e desativação/reativação.
- **Frontend — navegação**: `BarberHeader.tsx` ganha um segundo link condicional (`dono`), ao lado do já existente "Configurações".
- **Contrato de API**: adição pura de rotas novas (`/api/users`, `/api/users/:id`) — não altera nenhum endpoint/payload existente. `POST /api/login` ganha um novo motivo possível de rejeição (401, conta desativada), mas mantém o mesmo formato de resposta de erro já usado hoje. A sinalizar ao usuário mesmo assim (regra do `CLAUDE.md` raiz sobre mudanças de contrato entre os repos).

## 9) Critérios de aceitação
- [ ] Dono autenticado consegue acessar `/barber/usuarios` (inacessível a cliente, barbeiro, admin e visitante) e ver a lista de usuários com papel cliente/barbeiro/dono (nunca admin).
- [ ] Dono consegue criar um novo usuário (cliente, barbeiro ou dono) informando nome/email/senha/papel; tentar criar com papel `admin` é rejeitado (400) ou simplesmente não é uma opção disponível na UI/schema de validação.
- [ ] Dono consegue editar nome/email/telefone/papel/senha de um usuário existente (exceto o próprio); email duplicado é rejeitado com mensagem clara.
- [ ] Dono consegue desativar um usuário ativo; a partir daí, uma tentativa de login (via API) com as credenciais desse usuário é rejeitada (401, mensagem clara).
- [ ] Dono consegue reativar um usuário desativado; login volta a funcionar normalmente.
- [ ] Dono não consegue desativar a própria conta nem alterar o próprio papel através desta feature (proteção contra lockout).
- [ ] Sem nenhuma ação do dono (estado inicial pós-migration), todos os usuários existentes continuam `active: true` e conseguem logar normalmente — sem regressão.
- [ ] Barbeiro, admin e cliente (logados) não conseguem acessar `/barber/usuarios` nem os endpoints `/api/users*` (redirect na UI; 401/403 na API).
- [ ] Regra transversal do `ROADMAP_V2.md`: visitante e cliente continuam acessando exatamente as páginas já existentes (`/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`, `/meus-servicos`) sem restrição nova.

## 10) Open Questions (bloqueios / dúvidas)
Nenhuma. As decisões táticas necessárias — escopo de papéis gerenciáveis (cliente/barbeiro/dono, não admin), "desativar" via novo campo `active` em vez de hard delete, checagem de `active` no login único, proteção contra auto-desativação do dono, e não tocar nos endpoints `/api/admin`/`/api/clients`/`/api/auth/register` já existentes — estão resolvidas por evidência do codebase (seção 3) e pelo texto do próprio épico no `ROADMAP_V2.md` ("provavelmente dono não cria admin"; Epic 5 reserva acesso `admin` às páginas de configuração criadas aqui). Serão formalizadas como Decision Log na Fase 2 (planejamento).
