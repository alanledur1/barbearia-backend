# Spec — RBAC: papéis de usuário (cliente, barbeiro, dono, admin)

## Objective
- Unificar `Admin` e `Client` numa tabela `User` com `role` (`CLIENTE`, `BARBEIRO`, `DONO`,
  `ADMIN`), propagar `role` pelo JWT, aplicar autorização por role nas rotas que hoje estão
  abertas ou só checam "token válido", e estender o frontend para os 4 papéis.

## Scope
**In**
- Schema (`User` unificado), migration de dados (merge sem colisão de ID).
- JWT com `role`, middleware `requireRole`.
- Autorização nas rotas: `admin`, `client`, `service` (mutações), `appointment`, `auth/register`.
- Frontend: `AuthContext`, `ProtectedRoute` (múltiplos papéis), `Login/page.tsx` (novo contrato de
  resposta), guards existentes (`/barber`, `/meus-servicos`).
- Seed com 1 usuário por papel.

**Out**
- Telas de CRUD de usuário (Epic 4), seleção de barbeiro na UI (Epic 1), dashboard de métricas
  (Epic 6), configurações (Epic 5).
- Testes automatizados novos (não pedidos; validação é build/lint/migrate + E2E manual via browser
  ao final).

## Files to Modify

### `barbearia-backend/prisma/schema.prisma`
- Changes:
  - Adicionar `enum UserRole { CLIENTE BARBEIRO DONO ADMIN }`.
  - Renomear `model Admin` → `model User`, adicionar `role UserRole @default(CLIENTE)`, tornar
    `phone` opcional, manter `password` obrigatório.
  - Remover `model Client` (dados migram para `User` via migration manual).
  - `Appointment.adminId`/`admin` e `Appointment.clientId`/`client` passam a apontar para `User`
    (dois relations distintos pro mesmo model — precisa `@relation("AppointmentStaff")` e
    `@relation("AppointmentClient")` nos dois lados).
- Notes/Constraints:
  - **Não rodar `prisma migrate dev` direto** — gerar com `--create-only` e editar o SQL manualmente
    (ver seção Migration abaixo). Regra do `barbearia-backend/CLAUDE.md`: nunca alterar schema sem
    avisar; `DEPLOY_NORTHFLANK.md` exige expand/contract, sem drop destrutivo sem backup confirmado.
- Reuse:
  - Nenhum — é o núcleo da mudança.

### `barbearia-backend/src/utils/jwt.ts` (hoje vazio)
- Changes:
  - Adicionar `signUserToken(payload: { userId: number; role: string; email: string })` e
    `verifyUserToken(token: string)`, centralizando o que hoje está duplicado em
    `auth.service.ts` e `clientService.ts`.
- Reuse:
  - `jsonwebtoken` já é dependência usada nos dois lugares.

### `barbearia-backend/src/middlewares/auth.middleware.ts`
- Changes:
  - Trocar payload decodificado de `{ adminId, email }` para o formato genérico do novo
    `verifyUserToken` (`{ userId, role, email }`).
  - `req.user` passa a ser `{ id: number; role: UserRole; email: string }` (atualizar a
    declaração global `Express.Request.user`).
- Reuse:
  - Estrutura de try/catch e tratamento de `TokenExpiredError` já existentes — manter.

### `barbearia-backend/src/services/auth.service.ts`
- Changes:
  - `register`/`login` operam sobre `prisma.user` (não mais `prisma.admin`).
  - `login` aceita qualquer `role` (não é mais "login de admin"); retorna `{ token, user: {id,
    name, email, role} }`. Token assinado via `signUserToken` com o `role` do usuário.
  - `register` recebe `role` no payload (usado só por staff criando staff — ver
    `auth.routes.ts` abaixo).
- Reuse:
  - `bcryptjs` já usado aqui, manter.

### `barbearia-backend/src/services/clientService.ts`
- Changes:
  - `register`/`login` passam a operar sobre `prisma.user` filtrando/gravando
    `role: 'CLIENTE'`. Mantém o nome do arquivo/classe (`ClientService`) para não quebrar imports
    em `clientController.ts` e `unifiedLogin.controller.ts`.
  - `login` usa `signUserToken` (mesmo helper de `auth.service.ts`) em vez de assinar JWT inline.
- Reuse:
  - `CustomError` já usado, manter.

### `barbearia-backend/src/services/adminService.ts`
- Changes:
  - `listAll`/`findById`/`update`/`delete` operam sobre `prisma.user`. `listAll` filtra
    `role: { not: 'CLIENTE' }` (esta rota é gestão de staff, não de clientes).
- Reuse:
  - Padrão de `select` sem senha já usado, manter.

### `barbearia-backend/src/controllers/unifiedLogin.controller.ts`
- Changes:
  - Simplificar: como `Client` e `Admin` são a mesma tabela agora, não precisa mais tentar
    login como admin e cair pra client. Chama `AuthService.login` uma vez só; se falhar, retorna
    401 direto (remover o `try/catch` aninhado).
  - Resposta passa a ser `{ token, userType: role.toLowerCase(), user: {id, name, email} }` —
    **mudança de contrato com o frontend**, sinalizada na seção Notes.
- Reuse:
  - Nenhum — lógica simplifica.

### `barbearia-backend/src/controllers/clientController.ts`
- Changes:
  - `getById`/`update`: se `req.user.role === 'CLIENTE'`, só permite acessar/editar o próprio
    `req.user.id` (senão 403). `DONO`/`ADMIN` acessam qualquer um.
- Reuse:
  - `CustomError` já usado, manter.

### `barbearia-backend/src/controllers/appointment.controller.ts`
- Changes:
  - `listAll`: se `req.user.role === 'CLIENTE'`, força filtro por `clientId = req.user.id`
    (ignora `clientId` da query string se vier de outro id).
  - `getById`/`update`/`delete`: se `req.user.role === 'CLIENTE'`, só permite se
    `appointment.clientId === req.user.id`; e no `update`, cliente só pode setar
    `status: 'CANCELLED'` (não `'COMPLETED'`). Staff (`BARBEIRO`/`DONO`/`ADMIN`) sem essa restrição.
  - `create`: sem mudança de autorização (continua público, preserva agendamento de convidado).
- Reuse:
  - `CustomError`, padrão de resposta de erro já usados.

### `barbearia-backend/src/routes/admin.routes.ts`
- Changes: todas as rotas → `authMiddleware, requireRole('DONO', 'ADMIN')`.

### `barbearia-backend/src/routes/client.routes.ts`
- Changes:
  - `POST /signup`, `POST /login` continuam públicas.
  - `GET /` → `authMiddleware, requireRole('DONO', 'ADMIN')`.
  - `GET /:id`, `PUT /:id` → `authMiddleware` (ownership checado no controller, ver acima).
  - `DELETE /:id` → `authMiddleware, requireRole('DONO', 'ADMIN')`.

### `barbearia-backend/src/routes/service.routes.ts`
- Changes: `POST /`, `PUT /:id`, `DELETE /:id` → `authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN')`. `GET /`, `GET /:id` continuam públicas.

### `barbearia-backend/src/routes/appointment.routes.ts`
- Changes:
  - `POST /` continua pública.
  - `GET /`, `GET /:id`, `PATCH /:id` → `authMiddleware` (autorização fina no controller).
  - `DELETE /:id` → `authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN')`.

### `barbearia-backend/src/routes/auth.routes.ts`
- Changes:
  - `POST /register` → adicionar `authMiddleware, requireRole('DONO', 'ADMIN')` antes da
    validação. **Achado durante a spec**: hoje esta rota é pública — qualquer um pode se
    autocadastrar como o que hoje é "Admin". Corrigir aqui é aplicação direta da decisão de
    hierarquia já fechada (dono/admin criam staff), não uma nova decisão de produto.
  - `createAdminSchema` (em `admin.schemas.ts`) precisa aceitar `role: 'BARBEIRO'|'DONO'|'ADMIN'`
    no body (não `CLIENTE` — cliente só se cria via `/clients/signup`).

### `barbearia-backend/src/schemas/admin.schemas.ts`
- Changes: `createAdminSchema.body` ganha `role: z.enum(['BARBEIRO','DONO','ADMIN'])`.

### `barbearia-backend/src/prisma/seed.ts`
- Changes:
  - `admin@barbearia.com` → `role: 'DONO'`.
  - Adicionar seed de 1 `ADMIN` (ex.: `admin.sistema@barbearia.com`) e 1 `BARBEIRO` (ex.:
    `barbeiro.exemplo@barbearia.com`).
- Notes: mantém `bcrypt` (pacote usado aqui hoje, diferente de `bcryptjs` usado no resto — não
  consolidar neste epic, fora de escopo).

## Files to Create

### `barbearia-backend/src/middlewares/requireRole.middleware.ts`
- Purpose: middleware factory de autorização por role, reutilizável em todas as rotas acima.
- Contents:
  ```ts
  import { Request, Response, NextFunction } from 'express';

  export const requireRole = (...roles: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Acesso não permitido para este papel de usuário.' });
      }
      next();
    };
  ```
- Integration points: importado em todas as rotas listadas acima, sempre depois de `authMiddleware`.

### `barbearia-backend/prisma/migrations/<timestamp>_rbac_user_unification/migration.sql`
- Purpose: migration manual (gerada com `--create-only` e editada à mão) que:
  1. Cria `"UserRole"` enum.
  2. `ALTER TABLE "Admin" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'DONO'` (admin existente
     vira dono por default, depois ajustado por script/seed se necessário), `RENAME TO "User"`.
  3. Insere as linhas de `"Client"` dentro de `"User"` com **novos IDs** (sequence de `User`
     continua de onde parou), preservando uma coluna temporária `"_old_client_id"` pra rastrear o
     id antigo.
  4. `UPDATE "Appointment" SET "clientId" = u.id FROM "User" u WHERE u."_old_client_id" = "Appointment"."clientId"`.
  5. Dropa a coluna temporária `"_old_client_id"` e a tabela `"Client"`.
  6. Adiciona a FK de `Appointment.clientId` apontando pra `User` (troca de referência de tabela).
- Integration points: aplicada via `npx prisma migrate dev` **depois** de revisão manual do SQL
  gerado (nunca aplicar sem mostrar o SQL final antes).

## Implementation Order (recommended)
1. `prisma/schema.prisma` + gerar migration com `--create-only` + editar SQL manualmente + revisar com o usuário + aplicar.
2. `src/utils/jwt.ts` (helpers).
3. `src/middlewares/auth.middleware.ts` + `src/middlewares/requireRole.middleware.ts`.
4. `src/services/auth.service.ts`, `src/services/clientService.ts`, `src/services/adminService.ts`.
5. `src/controllers/unifiedLogin.controller.ts`, `clientController.ts`, `appointment.controller.ts`.
6. `src/routes/*.ts` (aplicar middlewares).
7. `src/schemas/admin.schemas.ts`.
8. `src/prisma/seed.ts`.
9. Frontend: `AuthContext.tsx` → `ProtectedRoute.tsx` → `app/barber/layout.tsx` /
   `app/meus-servicos/layout.tsx` → `app/Login/page.tsx` → `hooks/useClientData.tsx`.

## Validation (commands / checks)
- Backend: `npm run build` (tsc), `npx prisma generate`, `npx prisma migrate dev` (após revisão
  manual do SQL), `npm run seed`.
- Frontend: `npm run lint`, `npm run build`, `npm test` (Jest existente).
- Manual: login com cada um dos 4 papéis via browser, confirmar redirecionamento e acesso correto
  a `/barber` e `/meus-servicos`; confirmar que rotas antes abertas agora exigem token; confirmar
  que agendamento de convidado (sem login) continua funcionando.

## Notes
- **Mudança de contrato entre repos**: resposta de `POST /api/login` muda de
  `{ token, userType, admin, client }` para `{ token, userType, user }`, e `userType` passa a usar
  os valores `'cliente'|'barbeiro'|'dono'|'admin'` (antes era `'admin'|'client'`). Isso é sinalizado
  aqui porque toca `Login/page.tsx`, `AuthContext.tsx`, `ProtectedRoute.tsx`,
  `useClientData.tsx` no frontend — repositório separado, revisão própria.
- `bcrypt` (seed) vs `bcryptjs` (resto do código) continuam divergentes — não consolidado aqui.
