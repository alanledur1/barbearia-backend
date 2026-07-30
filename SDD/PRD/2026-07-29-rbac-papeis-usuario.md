# PRD — RBAC: papéis de usuário (cliente, barbeiro, dono, admin)

## 1) Objetivo
- Substituir o modelo atual de autenticação (uma única entidade `Admin` genérica, usada tanto
  como "dono" quanto como "barbeiro") por um sistema real de papéis: `cliente`, `barbeiro`,
  `dono`, `admin`.
- Cada papel ganha um nível de acesso distinto: cliente mantém dados salvos para agendamento;
  barbeiro passa a ser selecionável no fluxo de agendamento; dono ganha CRUD de usuários; admin
  ganha acesso total às páginas de configuração.
- Esta é a fundação (Epic 0) do roadmap v2 — bloqueia diretamente os epics de seleção de
  barbeiro, CRUD de usuários, configurações e dashboard de métricas.

## 2) Escopo

**Inclui**
- Modelagem de papel de usuário no backend (schema + auth + middleware de autorização).
- Ajuste do login unificado para retornar o papel correto.
- Extensão do `ProtectedRoute` do frontend para suportar os 4 papéis (hoje só aceita
  `'admin' | 'client'`).
- Middleware de autorização por role nas rotas backend que hoje não têm nenhum controle de
  papel (só JWT válido, ou nem isso).

**Não inclui (fora de escopo)**
- Telas de CRUD de usuários (dono) — Epic 4.
- Página de configurações da aplicação (admin) — Epic 5.
- Seleção de barbeiro no fluxo de agendamento — Epic 1 (usa o papel `barbeiro` criado aqui, mas a
  UI de seleção é outro epic).
- Dashboard de métricas agregadas — Epic 6.
- Qualquer migração de dados de produção além de renomear/estender o necessário para os 4 papéis.

## 3) Fluxo atual (como funciona hoje)

**Modelo de dados**: `prisma/schema.prisma` só tem `Admin` (id, email, password, name, phone) e
`Client` (id, name, email?, phone, password?). Não existe campo de role em nenhum dos dois.
`Admin` é usado tanto para login do "dono" quanto como profissional vinculado ao agendamento
(`Appointment.adminId`).

**Login**: `unifiedLogin.controller.ts` tenta login como `Admin` primeiro
(`AuthService.login`), se falhar tenta como `Client` (`ClientService.login`). Retorna
`userType: 'admin' | 'client'` no payload — é esse campo que o frontend usa para decidir o que
mostrar.

**JWT**: dois formatos de payload diferentes hoje —
`auth.service.ts:74` assina `{ adminId, email }`, `clientService.ts:44` assina
`{ clientId, name }`. Nenhum dos dois carrega um campo `role`.

**Middleware**: `auth.middleware.ts` só verifica assinatura/validade do token e popula
`req.user = { admin, email }` — não checa papel nenhum, e o nome da propriedade (`admin`) já
assume que quem chama é sempre um admin.

**Autorização por rota (estado real, não documentado antes)**:
- `admin.routes.ts` — todas as rotas usam `authMiddleware` (JWT válido), mas **qualquer** JWT
  válido (inclusive de outro admin) pode listar/editar/deletar **qualquer** admin. Não há checagem
  de "é o próprio admin" nem de role.
- `client.routes.ts` — `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id` **não têm middleware de
  autenticação nenhum**. Qualquer requisição sem token acessa/edita/deleta qualquer cliente.
- `service.routes.ts` — create/update/delete **não têm autenticação nenhuma**.
- `appointment.routes.ts` — todas as rotas (create/list/update/delete) **não têm autenticação
  nenhuma**.

**Frontend**: `AuthContext.tsx` guarda `user: { id, name, email?, userType: 'admin' | 'client' }`
e `token` no localStorage. `ProtectedRoute.tsx` recebe `allowedUserType: 'admin' | 'client'`
(tipo fixo, união de 2 valores) e redireciona pra `/Login` se `auth.user?.userType` não bater.
Usado em `app/barber/layout.tsx` (`allowedUserType="admin"`) e
`app/meus-servicos/layout.tsx` (`allowedUserType="client"`).

## 4) Fluxo desejado (comportamento esperado)

- Existir 4 papéis: `cliente`, `barbeiro`, `dono`, `admin`.
- Cliente: comportamento inalterado (mantém dados salvos, acessa `/meus-servicos`, `/agendamento`,
  páginas públicas).
- Barbeiro: entidade cadastrável, com login próprio, elegível para ser selecionado no
  agendamento (consumido pelo Epic 1). Substitui o uso atual de `Admin` como "barbeiro".
- Dono: nível acima do barbeiro. Terá CRUD de usuários (Epic 4) — este PRD só precisa garantir
  que o papel existe e que o middleware de autorização sabe negar/permitir por role.
- Admin: nível mais alto, acesso total a configurações (Epic 5) — mesma observação acima.
- Rotas que hoje não têm nenhuma autenticação (`client.routes.ts` CRUD, `service.routes.ts`
  mutações, `appointment.routes.ts` inteiro) passam a exigir token válido; a decisão de **qual
  papel** pode chamar cada uma é uma Open Question (seção 10) porque envolve trade-off de
  produto (ex.: cliente sem conta pode criar agendamento como convidado hoje — não pode quebrar).
- Frontend: `ProtectedRoute` aceita os 4 papéis (união de tipo ou array de papéis permitidos).

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- [barbearia-backend/src/routes/admin.routes.ts](barbearia-backend/src/routes/admin.routes.ts) — CRUD de admin, só `authMiddleware`, sem checagem de role/ownership.
- [barbearia-backend/src/routes/client.routes.ts](barbearia-backend/src/routes/client.routes.ts) — signup/login públicos (correto); listAll/getById/update/delete **sem** middleware nenhum.
- [barbearia-backend/src/routes/service.routes.ts](barbearia-backend/src/routes/service.routes.ts) — create/update/delete sem middleware.
- [barbearia-backend/src/routes/appointment.routes.ts](barbearia-backend/src/routes/appointment.routes.ts) — todas as rotas sem middleware.
- [barbearia-backend/src/routes/index.ts](barbearia-backend/src/routes/index.ts) — monta `/login` unificado e todos os sub-routers.
- [barbearia-backend/src/controllers/unifiedLogin.controller.ts](barbearia-backend/src/controllers/unifiedLogin.controller.ts) — tenta admin, cai pra client, retorna `userType`.
- [barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx](barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx) — guard de rota client-side, tipo fixo de 2 valores.
- [barbearia-shelby-frontend/src/app/barber/layout.tsx](barbearia-shelby-frontend/src/app/barber/layout.tsx) e [.../meus-servicos/layout.tsx](barbearia-shelby-frontend/src/app/meus-servicos/layout.tsx) — usam o guard acima.

### 5.2 Domínio / Regras / Serviços
- [barbearia-backend/src/services/auth.service.ts](barbearia-backend/src/services/auth.service.ts) — login/registro de `Admin`, assina JWT `{ adminId, email }`.
- [barbearia-backend/src/services/clientService.ts](barbearia-backend/src/services/clientService.ts) — login/registro de `Client`, assina JWT `{ clientId, name }`.
- [barbearia-backend/src/services/adminService.ts](barbearia-backend/src/services/adminService.ts) — CRUD de `Admin` (list/find/update/delete), sem hash de senha no update de fato usado (bloqueado no controller hoje).
- [barbearia-backend/src/middlewares/auth.middleware.ts](barbearia-backend/src/middlewares/auth.middleware.ts) — decodifica JWT, popula `req.user = { admin, email }`; precisa virar genérico (`{ id, role, email }`) e checar role.

### 5.3 Persistência / Modelos / Migrações
- [barbearia-backend/prisma/schema.prisma](barbearia-backend/prisma/schema.prisma) — `model Admin` e `model Client`, sem enum de role. `Appointment.adminId` já referencia `Admin` (será o "barbeiro" após a mudança).
- **Migrations**: projeto usa Prisma Migrate (`npx prisma migrate dev` / `deploy`), não Alembic/Flask. Histórico em `prisma/migrations/`. Qualquer mudança de schema aqui precisa seguir o padrão expand/contract documentado em `barbearia-backend/DEPLOY_NORTHFLANK.md` (sem `NOT NULL` direto sem default, sem rename direto, sem drop destrutivo sem aviso).
- [barbearia-backend/src/prisma/seed.ts](barbearia-backend/src/prisma/seed.ts) — cria um `Admin` fixo (`admin@barbearia.com`); precisa ser revisado se o modelo mudar de nome/shape.

### 5.4 Integrações externas (clients/adapters/providers)
- Nenhuma integração externa nova para este epic. `jsonwebtoken` e `bcryptjs` já são usados e continuam sendo a base.

### 5.5 UI / Componentes (se aplicável)
- [barbearia-shelby-frontend/src/context/AuthContext.tsx](barbearia-shelby-frontend/src/context/AuthContext.tsx) — tipo `User.userType: 'admin' | 'client'` precisa virar os 4 papéis.
- [barbearia-shelby-frontend/src/hooks/useBarberData.tsx](barbearia-shelby-frontend/src/hooks/useBarberData.tsx) e [useClientData.tsx](barbearia-shelby-frontend/src/hooks/useClientData.tsx) — consomem `auth.user.userType`, checam `=== 'client'` em pelo menos um ponto (`useClientData.tsx:33`).

### 5.6 Testes / Fixtures (se existirem)
- Não foram encontrados testes automatizados para auth/roles em nenhum dos dois repos (Jest está
  configurado no frontend mas sem specs relacionados a `AuthContext`/`ProtectedRoute`).

## 6) Padrões existentes para reuso (evitar duplicação)
- `authMiddleware` ([auth.middleware.ts](barbearia-backend/src/middlewares/auth.middleware.ts)) — reutilizar e estender (não recriar) para checar role.
- `validate.middleware.ts` — padrão de validação Zod já estabelecido, reutilizar para novos schemas de registro por papel.
- `CustomError` ([customErrors.ts](barbearia-backend/src/utils/customErrors.ts)) — padrão de erro já usado em `clientService`/`serviceService`, reutilizar em vez de criar novo tipo de erro.
- `ProtectedRoute.tsx` — reutilizar o componente, só estender o tipo de `allowedUserType`.
- `unifiedLogin.controller.ts` — padrão de "tenta X, cai pra Y" já resolve multi-tabela; se o
  modelo virar uma tabela única com role, esse controller pode simplificar bastante (decisão pra
  fase de planejamento).

## 7) Documentação externa (via Context7)

### Consultas realizadas

| Library ID | Query | Resumo do resultado |
|------------|-------|---------------------|
| `/auth0/node-jsonwebtoken` | "signing and verifying JWT with custom payload claims like role" | `jwt.sign`/`jwt.verify` aceitam claims livres (`role`, `permissions` etc.) sem validação própria da lib — confirma que dá pra adicionar `role` no payload sem mudar de biblioteca. |
| `/prisma/prisma/7.5.0` | "defining enum field for user role in schema.prisma and migrating existing table" | Enum required com `@default(VALUE)` gera `CREATE TYPE` + `ALTER TABLE ... NOT NULL DEFAULT` que faz backfill automático — relevante pra adicionar `role` em tabela existente sem quebrar linhas atuais. |
| `/vercel/next.js/v16.1.0` | "protecting routes and pages based on authenticated user role in App Router" | Next 16 App Router recomenda padrão Server Component + `verifySession()`/`forbidden()`. **Não se aplica direto aqui**: o projeto usa guard client-side (`ProtectedRoute` com `'use client'`), não o padrão de Server Components com DAL. Reuso fica limitado a estender o guard existente, não migrar arquitetura. |

### Trechos relevantes
- **jsonwebtoken**: claims livres no payload —
  ```javascript
  jwt.sign({ userId: 123, role: 'admin' }, secret);
  jwt.verify(token, secret, (err, decoded) => decoded.role);
  ```
- **Prisma**: enum obrigatório com default seguro em coluna nova:
  ```prisma
  enum Role { CLIENTE BARBEIRO DONO ADMIN }
  model User {
    role Role @default(CLIENTE)
  }
  ```

## 8) Impactos prováveis (áreas afetadas)
- Schema do banco (backend) — mudança estrutural, precisa de migration cuidadosa.
- Auth/login (backend) — payload do JWT muda, login unificado pode simplificar ou se ramificar mais.
- Autorização por rota (backend) — 4 rotas hoje sem proteção nenhuma ganham middleware.
- Contexto de autenticação e guard de rota (frontend) — contrato de `userType` muda de 2 para 4 valores; **isso é mudança de contrato entre os repos** e precisa ser sinalizada/coordenada conforme regra do `CLAUDE.md` raiz.
- Seed do banco (backend) — precisa criar usuários de exemplo para os 4 papéis.

## 9) Critérios de aceitação
- [ ] Existem 4 papéis distintos e cada usuário tem exatamente um papel.
- [ ] Login retorna o papel correto e o JWT carrega esse papel.
- [ ] Rotas de admin (`admin.routes.ts`) não permitem mais que qualquer JWT válido edite/delete
      qualquer registro de outro usuário sem ser o próprio dono do recurso ou um papel superior.
- [ ] Rotas de cliente, serviço e agendamento passam a exigir autenticação onde fizer sentido de
      produto (a decidir na Open Question 3), sem quebrar o fluxo de convidado (`guestName`/
      `guestEmail`/`guestPhone`) que hoje existe em `Appointment`.
- [ ] `ProtectedRoute` aceita os 4 papéis e os guards existentes (`/barber`, `/meus-servicos`)
      continuam funcionando sem regressão.
- [ ] Cliente e visitante (`null`) continuam acessando exatamente as páginas públicas que já
      existem hoje (`/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`,
      `/meus-servicos`) — guardrail do roadmap v2.
- [ ] Seed atualizado cobre pelo menos 1 usuário de cada papel.

## 10) Open Questions (bloqueios / dúvidas)
1. **Modelagem**: unificar `Admin` + `Client` numa tabela `User` com `role` enum (mexe em FKs de
   `Appointment` e em todo o auth), ou manter tabelas separadas e adicionar um `role` só em
   `Admin` (dono/barbeiro/admin), mantendo `Client` como está? Isso muda drasticamente o tamanho
   da migration e da spec.
2. **Hierarquia**: dono pode criar/promover outro admin? Admin pode criar outro admin? Ou só
   existe 1 admin "de sistema" fixo (seed) e o resto é dono/barbeiro/cliente?
3. **Autenticação nas rotas hoje públicas**: `client.routes.ts` (list/get/update/delete),
   `service.routes.ts` (mutações) e `appointment.routes.ts` (tudo) não têm middleware nenhum.
   Este epic fecha esse buraco (é pré-requisito de segurança pra RBAC fazer sentido) ou isso fica
   para os epics que tratam cada área (Epic 4 usuários, Epic 7 serviços)? Recomendo fechar aqui
   pelo menos a autenticação básica (token válido), deixando a granularidade fina de "qual role
   pode o quê em cada rota" para os epics específicos — mas é decisão de escopo do dono do
   produto.
4. **Migração de dados existentes**: o `Admin` seedado hoje (`admin@barbearia.com`) vira `dono`,
   `admin` ou os dois em usuários separados?
