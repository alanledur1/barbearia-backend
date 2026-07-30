# RBAC: papéis de usuário (cliente, barbeiro, dono, admin) — Implementation Plan

## Overview
Substituir o modelo atual (uma única entidade `Admin` genérica) por 4 papéis reais
(`CLIENTE`, `BARBEIRO`, `DONO`, `ADMIN`) numa tabela `User` unificada, propagar o papel pelo JWT,
fechar autorização em rotas hoje abertas (algumas sem autenticação nenhuma) e estender o frontend
pra reconhecer os 4 papéis. É o Epic 0 do roadmap v2 — bloqueia os demais epics (seleção de
barbeiro, CRUD de usuários, configurações, dashboard de métricas).

## Scope
### In Scope
- Schema unificado `User` + migration de dados (merge `Admin`+`Client` sem colisão de ID).
- JWT com `role`, middleware `requireRole`.
- Autorização por role em: `admin.routes`, `client.routes`, `service.routes` (mutações),
  `appointment.routes`, `auth.routes` (`/register`).
- Frontend: `AuthContext`, `ProtectedRoute` (múltiplos papéis), `Login/page.tsx`, guards de
  `/barber` e `/meus-servicos`, `useClientData.tsx`.
- Seed com 1 usuário por papel.
- Verificação E2E via browser antes de commit/push.

### Out of Scope
- Telas de CRUD de usuário (Epic 4), seleção de barbeiro na UI (Epic 1), dashboard de métricas
  (Epic 6), configurações (Epic 5), horário de funcionamento/feriados (Epic 2).
- Novos testes automatizados (Jest/Cypress) além dos já existentes.
- Consolidar `bcrypt`/`bcryptjs`.

## Current State (from codebase)
- `barbearia-backend/prisma/schema.prisma` — só `Admin` e `Client`, sem role.
- `barbearia-backend/src/middlewares/auth.middleware.ts` — decodifica JWT, não checa role.
- `barbearia-backend/src/routes/client.routes.ts` — list/get/update/delete sem autenticação.
- `barbearia-backend/src/routes/service.routes.ts` — mutações sem autenticação.
- `barbearia-backend/src/routes/appointment.routes.ts` — tudo sem autenticação.
- `barbearia-backend/src/routes/auth.routes.ts:14` — `/register` público, autocadastro de admin.
- `barbearia-shelby-frontend/src/context/AuthContext.tsx` — `userType: 'admin' | 'client'`.
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — só aceita 1 papel fixo.

## Desired End State
Login com qualquer um dos 4 papéis funciona, retorna o papel certo, e cada papel só acessa o que
pode: cliente só vê/edita os próprios dados e agendamentos; barbeiro/dono/admin gerenciam
serviços e agendamentos; só dono/admin acessam CRUD de staff; agendamento de convidado (sem
login) continua funcionando. Visitante e cliente mantêm acesso às páginas públicas de sempre.

## References
- PRD: `barbearia-backend/SDD/PRD/2026-07-29-rbac-papeis-usuario.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-07-29-rbac-papeis-usuario.md`
- Key code references:
  - `barbearia-backend/src/services/appointmentService.ts:148` — guest booking não cria `Client`/`User`, usa `guestName/guestEmail/guestPhone`.
  - `barbearia-shelby-frontend/src/app/Login/page.tsx:24` — contrato atual de resposta do login.

---

## Phase 1: Schema + migration de dados (alto risco)
### Tasks
- [x] Adicionar `enum UserRole` e reshape de `Admin` → `User` (+ `role`, `phone` opcional) em `prisma/schema.prisma`.
- [x] Remover `model Client` do schema.
- [x] Ajustar relations de `Appointment` (`admin`/`client`) para apontar pra `User`.
- [x] Gerar migration com `npx prisma migrate dev --create-only --name rbac_user_unification`.
- [x] Editar manualmente o SQL gerado: rename `Admin`→`User` preservando IDs, merge de `Client`
      com remapeamento de ID (coluna temporária `_old_client_id`), `UPDATE` de `Appointment.clientId`,
      drop da coluna temporária e da tabela `Client` antiga, ajuste de FK.
- [x] **Mostrar o SQL final ao usuário antes de aplicar.**
- [x] Aplicar migration localmente (`npx prisma migrate dev`) e `npx prisma generate`.
- [x] (Achado durante execução) `prisma/schema.prisma` estava sem `model Otp`, embora a migration
      `20260512222028_add_otp_table` já tivesse criado a tabela no banco — a migration naive ia
      dropar `Otp`. Restaurado `model Otp` no schema antes de gerar a migration final, sem tocar
      na tabela.
- [x] (Achado durante execução) `_prisma_migrations` local tinha 2 entradas fantasmas + 1 migration
      nunca finalizada, não presentes em `prisma/migrations/`. Usuário confirmou (com consentimento
      explícito exigido pela trava do Prisma para agentes de IA) reset do banco local antes de
      gerar a migration nova. **Usuário reportou que produção tem a mesma inconsistência** — isso
      NÃO foi tocado (sem acesso/credencial de produção neste ambiente); ver Rollout Notes.

### Success Criteria
#### Automated Verification
- [x] `npx prisma validate` (schema válido)
- [x] `npx prisma migrate dev` roda sem erro localmente
- [ ] `npm run build` (tsc) compila sem erro — adiado pro final da Phase 2 (renomear `Admin`→`User`
      quebra a compilação de todo arquivo que usa `prisma.admin`/`prisma.client` até esses arquivos
      serem atualizados na Phase 2; rodar build agora só entre as duas fases sempre falharia)

#### Manual Verification
- [x] Usuário revisou e aprovou o SQL da migration antes de aplicar
- [x] Dados de `Admin` e `Client` existentes (ambiente local) aparecem corretos em `User` após a
      migration — testado com fixtures sintéticas (Admin id=1 → User id=1 role DONO; Client id=1 →
      User id=2 role CLIENTE, caso desenhado pra pegar bug de não-remapeamento)
- [x] `Appointment.clientId` de registros existentes ainda aponta pro cliente certo —
      confirmado via query: `clientId` remapeado de 1 para 2 corretamente, `adminId` preservado em 1

---

## Phase 2: Backend — auth, middleware e autorização por rota
### Tasks
- [x] `src/utils/jwt.ts` — `signUserToken`/`verifyUserToken`.
- [x] `src/middlewares/auth.middleware.ts` — payload genérico `{ id, role, email }`.
- [x] `src/middlewares/requireRole.middleware.ts` (novo).
- [x] `src/services/auth.service.ts`, `clientService.ts`, `adminService.ts` — operar sobre `prisma.user`.
- [x] `src/controllers/unifiedLogin.controller.ts` — simplificar (uma tabela só, sem tentar 2x).
- [x] `src/controllers/clientController.ts`, `appointment.controller.ts` — ownership check por role.
- [x] `src/routes/admin.routes.ts`, `client.routes.ts`, `service.routes.ts`, `appointment.routes.ts`, `auth.routes.ts` — aplicar `authMiddleware`/`requireRole` conforme Spec.
- [x] `src/schemas/admin.schemas.ts` — `role` no `createAdminSchema`.
- [x] (Achado durante execução) `appointmentService.ts` usava `prisma.admin.findFirst()` e
      `prisma.client.findFirst()` (fallback de profissional padrão / busca de cliente por telefone
      no agendamento de convidado) — migrado pra `prisma.user` com filtro de `role`.
- [x] (Achado durante execução) `admin.controller.ts` ainda tipava `Prisma.AdminUpdateInput` —
      trocado por `Prisma.UserUpdateInput`.

### Success Criteria
#### Automated Verification
- [x] `npm run build` compila sem erro (`tsc`, exit code 0)

#### Manual Verification
- [x] `POST /api/login` com cada um dos 4 papéis retorna token + `role` corretos — testado via curl
      pra DONO, ADMIN, BARBEIRO, CLIENTE, `userType` retornado em minúsculas (`dono`, `admin`,
      `barbeiro`, `cliente`)
- [x] `POST /api/auth/register` sem token retorna 401 — confirmado via curl
- [x] `GET /api/clients`, `DELETE /api/appointments/:id`, `POST /api/services` sem token retornam
      401 — confirmado via curl (os três)
- [x] `POST /api/appointments` sem token (agendamento de convidado) continua funcionando — 201
      confirmado via curl
- [x] (Extra, validado além do plan original) DONO lista `/api/clients` (200); BARBEIRO cria
      `/api/services` (201); CLIENTE tenta `PATCH` pro próprio agendamento com `status: COMPLETED`
      → 403 com mensagem clara; CLIENTE com `status: CANCELLED` no próprio agendamento → 200

---

## Phase 3: Seed
### Tasks
- [x] `src/prisma/seed.ts` — `admin@barbearia.com` vira `DONO`; adicionado seed de 1 `ADMIN` e 1 `BARBEIRO`.
- [x] (Achado durante execução) `seed.ts` nunca carregava `.env` (só `server.ts` fazia
      `import "dotenv/config"`), então rodar `npm run seed` isolado falhava com erro de senha do
      Postgres. Adicionado `import "dotenv/config"` no topo do `seed.ts`.

### Success Criteria
#### Automated Verification
- [x] `npm run seed` roda sem erro

#### Manual Verification
- [x] Os usuários aparecem no banco com o `role` certo — confirmado via query: id1 DONO (conta
      existente preservada), id3 ADMIN, id4 BARBEIRO (id2 é o CLIENTE de teste da Phase 1)

---

## Phase 4: Frontend — papéis e guards
### Tasks
- [x] `src/context/AuthContext.tsx` — `userType` vira `'cliente'|'barbeiro'|'dono'|'admin'`.
- [x] `src/components/ProtectedRoute/ProtectedRoute.tsx` — `allowedUserType` aceita 1 papel ou array de papéis.
- [x] `src/app/barber/layout.tsx` — `allowedUserType={['barbeiro','dono','admin']}`.
- [x] `src/app/meus-servicos/layout.tsx` — `allowedUserType="cliente"`.
- [x] `src/app/Login/page.tsx` — novo contrato de resposta (`{ token, userType, user }`).
- [x] `src/hooks/useClientData.tsx` — trocar checagem `=== 'client'` por `=== 'cliente'`.
- [x] (Achado durante execução) `src/app/agendamento/page.tsx:198` e
      `src/components/navbar/Navbar.tsx:83` também comparavam `userType === 'admin'` (não estavam
      no Spec original) — atualizados para checar os 3 papéis de staff (`barbeiro`/`dono`/`admin`).

### Success Criteria
#### Automated Verification
- [x] `npm run lint` — **achado**: Next 16 removeu o subcomando `next lint`; `npm run lint`
      (`next lint`) falha com "Invalid project directory" independente das minhas mudanças.
      Rodei `npx eslint src` diretamente: 0 erros, 0 warnings.
- [x] `npm run build` sem erro (compilação TS + todas as 10 rotas geradas como estático)
- [x] `npm test` — **achado**: não existe nenhum arquivo de teste Jest no repo hoje (0 matches),
      apesar de `jest` estar configurado — não é regressão minha, já documentado no PRD.

#### Manual Verification
- [x] Login como cliente redireciona pra `/` e acessa `/meus-servicos` (mostrando só o próprio
      agendamento cancelado) — testado no browser
- [x] Login como barbeiro/dono/admin redireciona pra `/barber` e acessa a área — testado os 3 papéis
- [x] Cliente tentando acessar `/barber` é redirecionado pro `/Login` — confirmado
- [x] Visitante (sem login) continua acessando `/Servicos` e `/agendamento` normalmente — confirmado
      (console sem erros)

---

## Phase 5: Verificação E2E via browser antes de commit/push
### Tasks
- [x] Rodar backend (`npm run dev`) e frontend (`npm run dev`) localmente.
- [x] Via browser: fluxo completo de login para os 4 papéis, navegação pelas páginas protegidas,
      agendamento como convidado (sem login), cancelamento de agendamento pelo cliente, ações do
      barbeiro (billing, serviços).
- [x] Rodar scripts de teste existentes do repo — **achado**: não há suite E2E própria (Cypress
      citado no `CLAUDE.md` não está configurado no repo, só documentado); `npm test` (Jest) não
      tem specs (0 matches, pré-existente).
- [x] Checar console do browser e network requests por erros 401/403 inesperados durante o fluxo.
- [x] (Achado durante execução) `GET /api/billing/summary` (`routes/index.ts`) não tinha middleware
      nenhum — dado financeiro completamente aberto, fora do Spec original. Corrigido:
      `authMiddleware` + `requireRole('BARBEIRO','DONO','ADMIN')`. Confirmado 401 sem token, 200
      com token de staff, e a tela de Faturamento no browser continua funcionando (já enviava o
      header `Authorization`).

### Success Criteria
#### Automated Verification
- [x] `npm test` (frontend) — sem specs no repo (achado pré-existente, não é regressão)
- [x] `npm run build` (backend e frontend) sem erro — rodado de novo após o fix do billing, ambos limpos

#### Manual Verification
- [x] Todos os fluxos E2E passaram sem erro no console/network:
      login DONO/ADMIN/BARBEIRO → `/barber` (dashboard, serviços, faturamento);
      login CLIENTE → `/` → `/meus-servicos` (só o próprio agendamento) → bloqueado em `/barber`;
      visitante → `/Servicos`, `/agendamento` (com serviços reais da API) sem login;
      agendamento de convidado via API → 201; cliente cancela próprio agendamento → 200;
      cliente tenta concluir próprio agendamento → 403.
- [ ] Usuário confirma que pode prosseguir para commit/push

---

## Testing Notes
- Unit tests: nenhum criado neste epic (não solicitado); Jest existente no frontend deve continuar
  passando.
- Integration tests: não existem hoje no backend; validação é via chamadas manuais/curl na Fase 2
  e via browser na Fase 5.
- Manual steps: detalhados em cada fase acima.

## Migration Notes
- Projeto usa **Prisma Migrate** (não Flask/Alembic — os templates `SDD/planejamento.md` e
  `SDD/implementar.md` citam Flask, isso não se aplica aqui, ignorar essa seção neles).
- Fluxo real: 1) editar `schema.prisma`; 2) `npx prisma migrate dev --create-only --name <nome>`;
  3) revisar/editar o SQL gerado manualmente (esta migration em especial precisa de edição manual
  pro merge `Admin`+`Client` sem colisão de ID); 4) mostrar o SQL final ao usuário; 5)
  `npx prisma migrate dev` para aplicar local; 6) commitar `schema.prisma` + pasta da migration
  juntos; 7) em produção, `npx prisma migrate deploy` (via `npm run migrate`, já configurado).

## Rollout Notes
- Esta migration mexe em dado de produção real (tabelas `Admin`/`Client` existentes no Northflank).
  Rodar e validar em ambiente local primeiro; só aplicar em produção depois de aprovação explícita
  do usuário sobre o SQL final.
- **Achado crítico durante a Phase 1**: `.gitignore` tinha `prisma/migrations/` — a pasta de
  migrations nunca foi versionada. Como o `Dockerfile:14` faz `COPY prisma ./prisma` a partir do
  contexto de build (git), isso significa que **nenhuma migration nunca chegou na imagem de
  produção** via o pipeline documentado em `DEPLOY_NORTHFLANK.md`. Isso explica as entradas
  fantasmas encontradas em `_prisma_migrations` de produção (migrations rodadas localmente/ad-hoc
  direto no banco, sem o arquivo correspondente nunca ter sido commitado). Corrigido: removida a
  linha `prisma/migrations/` do `.gitignore`. A partir de agora, as 4 migrations reais + esta nova
  ficam versionadas e vão pro build do Docker.
- **Produção continua com o histórico divergente** (entradas fantasmas + 1 migration nunca
  finalizada) — isso não foi tocado, não há credencial de produção neste ambiente. Antes de rodar
  o Release Pipeline com esta migration em produção, alguém com acesso direto ao banco precisa:
  1. Confirmar o schema real de produção bate com o que as 4 migrations do repo produziriam
     (`Admin`, `Client`, `Service`, `Appointment`, `Otp` com as colunas esperadas).
  2. Resolver as entradas fantasmas/falha em `_prisma_migrations` — provavelmente via
     `prisma migrate resolve --applied <nome>` para cada uma, **nunca** `migrate reset`.
  3. Só então rodar o Release Pipeline (Build → job de migration `npm run migrate` → Promote).
