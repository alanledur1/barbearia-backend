PLAN PATH: barbearia-backend/SDD/PLAN/2026-07-30-crud-usuarios-dono.md

# CRUD de usuários (clientes, barbeiros, donos) restrito ao papel dono — Implementation Plan

## Overview
Hoje não existe nenhuma superfície única para o dono gerenciar contas de cliente/barbeiro/dono: criar staff exige `POST /api/auth/register` (sem UI), e não existe nenhum conceito de "desativar" — só exclusão definitiva (`/api/admin/:id`, `/api/clients/:id`), também sem UI. Vamos: (1) adicionar um campo `active` (Boolean, default `true`) ao model `User`, (2) bloquear login (`AuthService.login`, caminho único de autenticação de todos os papéis) para usuários com `active: false`, (3) expor um CRUD novo e dedicado (`GET/POST/PUT /api/users`), restrito a `authMiddleware` + `requireRole('DONO')` (só dono, não admin), que só enxerga e só cria/edita usuários com papel `CLIENTE`/`BARBEIRO`/`DONO` (nunca `ADMIN`), e (4) criar uma página `/barber/usuarios`, acessível somente para `dono`, com listagem filtrável, criação, edição e desativação/reativação.

Decisões de escopo fechadas no PRD (sem Open Questions): gestão de `ADMIN` fica de fora (roadmap: "dono não cria admin"; Epic 5 dará acesso de `admin` a esta mesma página depois); "desativar" é implementado como um campo `active` (não exclusão — preserva o histórico de agendamentos, que hoje já sobrevive a uma exclusão via `ON DELETE SET NULL`, mas perderia a referência); o dono não pode editar/desativar/trocar o próprio papel através desta feature (proteção contra lockout, já que só `DONO` acessa estes endpoints); os endpoints pré-existentes `/api/admin[s]`, `/api/clients`, `/api/auth/register` não são alterados.

## Scope
### In Scope
- `prisma/schema.prisma`: campo novo `active Boolean @default(true)` em `model User`.
- Migration Prisma aditiva (`npx prisma migrate dev --name add_user_active_flag`).
- `src/services/auth.service.ts`: `login` passa a rejeitar (401, `CustomError`) usuários com `active: false`, após validar a senha.
- Backend novo: `src/services/userService.ts`, `src/controllers/user.controller.ts`, `src/routes/user.routes.ts`, montados em `src/routes/index.ts` sob `/api/users`, restritos a `authMiddleware` + `requireRole('DONO')`.
- Frontend novo: página `/barber/usuarios` (guarda `dono`-only), hook `useUsers.tsx`, modal de criação/edição (`UserFormModal.tsx`), reaproveitando `ConfirmationModal.tsx` já existente para confirmar desativação/reativação, link de navegação condicional em `BarberHeader.tsx`.

### Out of Scope
- Qualquer gestão (criar/listar/editar/desativar) de usuários com papel `ADMIN` — fora desta feature em todas as camadas (schema à parte, backend rejeita/oculta, frontend nem oferece a opção).
- Acesso de `ADMIN` à página `/barber/usuarios` (Epic 5).
- Exclusão definitiva (hard delete) via esta feature — só `active` (desativar/reativar). Hard delete pré-existente (`/api/admin/:id`, `/api/clients/:id`) não é alterado.
- Qualquer mudança em `/api/admin`, `/api/admins`, `/api/clients`, `/api/auth/register` (incluindo a duplicidade de montagem de `adminRoutes` em `/api/admin` e `/api/admins` — documentada no PRD, não corrigida aqui).
- Edição do próprio perfil do usuário logado através desta feature (dono não pode se auto-editar via `/api/users/:id`/`/barber/usuarios`; fluxo de "esqueci senha" já existente continua sendo o caminho para isso).
- Paginação/busca textual na listagem.

## Current State (from codebase)
- `barbearia-backend/prisma/schema.prisma:15-27` — `model User`: `id`, `name`, `email?`, `phone?`, `password`, `role: UserRole @default(CLIENTE)`, `createdAt`, `updatedAt`. Sem campo de status/ativo.
- `barbearia-backend/src/services/auth.service.ts:52-90` — `AuthService.login`: busca por `email` sem filtrar `role` (usado por **todos** os papéis via `POST /api/login`), compara senha, gera token. Sem checagem de status.
- `barbearia-backend/src/controllers/unifiedLogin.controller.ts:12-32` — `UnifiedLoginController.login` chama `authService.login`; já trata `CustomError` preservando `statusCode`/`message` (fallback genérico 401 só para erros não-`CustomError`).
- `barbearia-backend/src/routes/index.ts:19` — `POST /login` (unificado); linhas 20-26 montam os demais routers (`clients`, `services`, `appointments`, `auth`, `admin`, `business-hours`, `holidays`) — local de montagem de `/users`.
- `barbearia-backend/src/routes/admin.routes.ts` + `src/controllers/admin.controller.ts` + `src/services/adminService.ts` — precedente de CRUD de staff (`role != CLIENTE`), mas restrito a `requireRole('DONO', 'ADMIN')` e sem rota de criação; `adminService.update` já mostra o padrão de hash condicional de senha (`adminService.ts:46-48`).
- `barbearia-backend/src/routes/auth.routes.ts:17` — `POST /auth/register` (cria staff com `role` em `BARBEIRO|DONO|ADMIN`), restrito a `requireRole('DONO', 'ADMIN')`, usa `createAdminSchema` (`src/schemas/admin.schemas.ts:4-12`, senha mín. 8 caracteres).
- `barbearia-backend/src/services/clientService.ts:9-39` — precedente de `register` com checagem de email duplicado (`CustomError(409)`).
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — `requireRole(...roles)`.
- `barbearia-backend/src/utils/customErrors.ts` — `CustomError(message, statusCode, details?)`.
- `barbearia-backend/prisma/migrations/20260730002447_rbac_user_unification/migration.sql:40-41` — confirma `ON DELETE SET NULL` de `Appointment.adminId`/`clientId` → `User.id` (exclusão de usuário não quebra FK, mas apaga a referência histórica — motivo de preferir `active` a hard delete).
- `barbearia-backend/src/prisma/seed.ts` — cria 3 usuários fixos via `upsert`; sem alteração necessária (novo campo usa `@default(true)`).
- `barbearia-shelby-frontend/src/app/barber/configuracoes/*` (Epic 2) — precedente completo de página `dono`-only dentro de `/barber` (layout de guarda `ProtectedRoute allowedUserType={['dono']}`, hook `getHeaders`/`fetchAll`, SCSS module com tokens de cor já definidos).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/EditServiceModel.tsx` + `EditServiceModal.module.scss` — precedente de modal de formulário (`.overlay`, `.modal`, `.inputGroup`, `.actions`, `.saveButton`, `.cancelButton`).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/ConfirmationModal.tsx` — modal de confirmação genérico e reutilizável (`isOpen`/`onClose`/`onConfirm`/`title`/`message`), a reaproveitar diretamente (sem duplicar).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx:51-55` — já tem o link condicional a `dono` para "Configurações"; o novo link "Usuários" segue o mesmo bloco.
- `barbearia-shelby-frontend/src/context/AuthContext.tsx` — `useAuth()` expõe `user.id`/`user.userType`/`token` (usado para esconder ações de auto-edição na própria linha do dono na tabela).
- Não há testes automatizados (`*.test.ts`/`*.spec.ts`/`*.cy.*`) cobrindo usuários/admin/clientes em nenhum dos dois repos.

## Desired End State
- Dono autenticado acessa `/barber/usuarios`, vê a lista de usuários (cliente/barbeiro/dono, nunca admin) com filtro por papel, cria um novo usuário, edita um existente (exceto a si mesmo) e desativa/reativa (exceto a si mesmo).
- Um usuário desativado não consegue mais logar (`POST /api/login` → 401, mensagem clara); reativado, volta a logar normalmente.
- Sem nenhuma ação do dono (estado inicial pós-migration), todo usuário existente permanece `active: true` e loga normalmente — sem regressão.
- Barbeiro, admin, cliente e visitante não acessam `/barber/usuarios` nem `/api/users*` (redirect/403/401).
- Verificação: `npm run build` limpo nos dois repos; `npx eslint src` limpo no frontend; walkthrough manual no navegador + chamadas reais à API (criação, edição, desativação/reativação, bloqueio de login, proteção contra auto-edição, guardas de acesso por papel).

## References
- PRD: `barbearia-backend/SDD/PRD/2026-07-30-crud-usuarios-dono.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-07-30-crud-usuarios-dono.md`
- Key code references:
  - `barbearia-backend/prisma/schema.prisma:15-27`
  - `barbearia-backend/src/services/auth.service.ts:52-90`
  - `barbearia-backend/src/routes/index.ts:1-29`
  - `barbearia-backend/src/services/adminService.ts`, `src/services/clientService.ts`
  - `barbearia-shelby-frontend/src/app/barber/configuracoes/*`
  - `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/{EditServiceModel,ConfirmationModal}.tsx`
  - `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`

---

## Phase 1: Schema — campo `active` em `User`
### Tasks
- [x] Adicionar `active Boolean @default(true)` ao `model User` em `barbearia-backend/prisma/schema.prisma` (ver Spec para posição exata).
- [x] Rodar `npx prisma migrate dev --name add_user_active_flag` dentro de `barbearia-backend/`.
- [x] Revisar o SQL gerado em `prisma/migrations/<timestamp>_add_user_active_flag/migration.sql`: confirmar que é só `ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true` (sem `DROP`/`RENAME`/`NOT NULL` sem default).

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npx prisma migrate dev --name add_user_active_flag` — aplica sem erro.
- [x] `cd barbearia-backend && npx prisma generate` — Prisma Client regenerado sem erro (`prisma.user.active` disponível nos tipos).
- [x] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [x] Inspecionar o `migration.sql` gerado (leitura direta) e confirmar que contém apenas `ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true` (mais nada). Confirmado.
- [x] Confirmar (via Prisma Studio ou query pontual) que usuários já existentes (seed) aparecem com `active: true` automaticamente após a migration, sem necessidade de rodar o seed de novo. Confirmado.

---

## Phase 2: Backend — CRUD `/api/users` (criar/listar/editar, restrito a `DONO`)
### Tasks
- [x] Criar `barbearia-backend/src/services/userService.ts` (`listAll(roleFilter?)`, `findById(id)`, `create(data)`, `update(actorId, targetId, data)`), operando só sobre papéis `CLIENTE`/`BARBEIRO`/`DONO`, com bloqueio de auto-edição (`targetId === actorId`), hashing de senha (criação obrigatória, edição opcional) e checagem de email duplicado.
- [x] Criar `barbearia-backend/src/controllers/user.controller.ts` (`listAll`, `getById`, `create`, `update`).
- [x] Criar `barbearia-backend/src/routes/user.routes.ts` (`authMiddleware` + `requireRole('DONO')` em todas as rotas).
- [x] Montar a rota em `barbearia-backend/src/routes/index.ts` (`/users`).

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [x] Com token de `DONO` (login via `POST /api/login`): `POST /api/users` com `{name,email,password,role:'BARBEIRO'}` retorna 201; `role:'ADMIN'` retorna 400; email duplicado retorna 409. Confirmado via curl real.
- [x] `GET /api/users` retorna só papéis cliente/barbeiro/dono (nunca admin, mesmo que exista `admin.sistema@barbearia.com` no banco); `GET /api/users?role=BARBEIRO` filtra corretamente; `GET /api/users?role=ADMIN` retorna 400. Confirmado via curl real.
- [x] `PUT /api/users/:id` de outro usuário atualiza nome/telefone/papel/`active`; do **próprio** dono logado (mesmo `id` do token) retorna 400 (auto-edição bloqueada). Confirmado via curl real.
- [x] Sem token (ou com token de `barbeiro`/`admin`/`cliente`), todas as rotas acima retornam 401/403. Confirmado via curl real.

---

## Phase 3: Backend — bloqueio de login para usuário desativado
### Tasks
- [x] `barbearia-backend/src/services/auth.service.ts`: `login` passa a lançar `CustomError('Esta conta foi desativada. Entre em contato com o administrador.', 401)` quando `user.active === false`, checado **após** a validação de senha (não antes, para não vazar status de conta a quem não sabe a senha).

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [x] Com o servidor local rodando: desativado um usuário de teste via `PUT /api/users/:id` (`{active:false}`, token `DONO`); confirmado via `POST /api/login` real com as credenciais desse usuário que o login é rejeitado (401, mensagem "Esta conta foi desativada..."); reativado (`{active:true}`) e confirmado que o login volta a funcionar (200). Usuário de teste e suas alterações revertidas/removidas ao final.

---

## Phase 4: Frontend — página de usuários (dono only)
### Tasks
- [x] Criar `barbearia-shelby-frontend/src/hooks/useUsers.tsx` (fetch/create/update de usuários, seguindo o padrão de `useBusinessSettings.tsx`).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx` (guarda `ProtectedRoute allowedUserType={['dono']}`, mesmo padrão de `barber/configuracoes/layout.tsx`).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/usuarios/UserFormModal.tsx` (modal de criação/edição, reaproveitando a estrutura visual de `EditServiceModel.tsx`).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/usuarios/page.tsx` (listagem com filtro por papel, botão "Novo Usuário", ações de editar/desativar/reativar por linha, reaproveitando `ConfirmationModal.tsx` já existente para confirmar a troca de status).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/usuarios/Usuarios.module.scss` (estilos, seguindo os tokens já usados em `Configuracoes.module.scss`/`EditServiceModal.module.scss`).
- [x] Atualizar `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`: adicionar o link "Usuários" (`next/link` para `/barber/usuarios`), condicionado a `auth.user?.userType === 'dono'`, ao lado do link "Configurações" já existente.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-shelby-frontend && npm run build` — build de produção sem erros; rota `/barber/usuarios` gerada.
- [x] `cd barbearia-shelby-frontend && npx eslint src` — sem erros.

#### Manual Verification
- [x] Logado como `dono`: `/barber/usuarios` carrega e lista os usuários; criar um novo usuário (cada papel) funciona; editar um usuário existente (não o próprio) funciona; desativar/reativar funciona (com o `ConfirmationModal`) e reflete no status exibido. Confirmado via walkthrough real no navegador.
- [x] Na própria linha do dono logado, os botões de editar/desativar não aparecem (mostra "Você" no lugar). Confirmado.
- [x] Logado como `barbeiro`, `admin` ou `cliente`: acessar `/barber/usuarios` diretamente pela URL redireciona; o link "Usuários" não aparece no header desses papéis. Confirmado para os três papéis.
- [x] Deslogado (visitante): acessar `/barber/usuarios` redireciona para `/Login`. Confirmado.
- [x] Regra transversal: `/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`, `/meus-servicos` continuam acessíveis normalmente (HTTP 200) para visitante. Confirmado.

---

## Testing Notes
- Unit tests: não há suíte de testes de backend hoje — não introduzida por este plano (fora de escopo).
- Integration tests: idem.
- Manual steps: 1) `npx prisma migrate dev` no backend; 2) `npm run dev` no backend; 3) `npm run dev` no frontend; 4) login como `dono` (seed: `admin@barbearia.com`) para testar `/barber/usuarios` e as rotas `/api/users*`; 5) criar um usuário de teste (ex. papel `BARBEIRO`) para validar desativação + bloqueio de login, depois desativar/remover esse usuário de teste ao final (via `PUT` para reativar, ou hard delete pré-existente em `/api/admin/:id` se necessário limpar).

## Migration Notes
- Projeto usa **Prisma 7**. Fluxo: (1) editar `prisma/schema.prisma`; (2) `npx prisma migrate dev --name add_user_active_flag`; (3) revisar o SQL gerado — deve conter só `ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true`, sem `DROP`/`RENAME`; (4) commitar `schema.prisma` + a nova pasta em `migrations/` juntos.
- Coluna nova com `DEFAULT true` em tabela existente — permitido pelas regras de expand/contract do `barbearia-backend/CLAUDE.md` (o problema seria `NOT NULL` **sem** default; aqui há default). Se o script gerado contiver qualquer `DROP`/`ALTER` destrutivo inesperado, a execução deste plano deve parar e reportar antes de aplicar.
- Em produção, `npm run migrate` (`prisma migrate deploy`) roda no pipeline de deploy — a nova migration é aplicada automaticamente.

## Rollout Notes
- Mudança de contrato de API: rotas novas e aditivas (`/api/users`, `/api/users/:id`), restritas a `DONO`. `POST /api/login` ganha um novo motivo possível de rejeição (401, conta desativada), mantendo o mesmo formato de resposta de erro (`{ error: string }`) já usado hoje.
- Sinalizar ao usuário: rotas novas entre os dois repos, e o novo comportamento de bloqueio de login (regra do `CLAUDE.md` raiz sobre mudanças de contrato).
