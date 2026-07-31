# Spec — Área de configurações da aplicação com acesso total restrito ao papel admin

## Objective
Estender os guards de autorização das páginas/rotas de configuração hoje restritas a `DONO`
(horário de funcionamento + feriados do Epic 2, CRUD de usuários do Epic 4) para também aceitar
`ADMIN`, sem alterar nenhum outro comportamento.

## Scope
**In**
- 3 arquivos de rotas backend (`businessHours.routes.ts`, `holiday.routes.ts`, `user.routes.ts`).
- 2 arquivos de layout frontend (`barber/configuracoes/layout.tsx`, `barber/usuarios/layout.tsx`).
- 1 componente frontend (`BarberHeader.tsx`) — condição de exibição de 2 links.

**Out**
- `userService.ts` (`MANAGEABLE_ROLES`), schema Prisma, qualquer outra rota/página, testes
  automatizados novos.

## Files to Modify

### `barbearia-backend/src/routes/businessHours.routes.ts`
- Changes:
  - Linha 9: `router.get('/', authMiddleware, requireRole('DONO'), controller.listAll);` →
    `router.get('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.listAll);`
  - Linha 10: `router.put('/', authMiddleware, requireRole('DONO'), controller.updateBulk);` →
    `router.put('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.updateBulk);`
- Notes/Constraints:
  - Só a lista de papéis muda; assinatura de `requireRole(...roles: string[])` já suporta
    múltiplos argumentos, nenhuma mudança no middleware.
- Reuse:
  - Mesmo padrão de `barbearia-backend/src/routes/admin.routes.ts:14`.

### `barbearia-backend/src/routes/holiday.routes.ts`
- Changes:
  - Linha 9: `requireRole('DONO')` → `requireRole('DONO', 'ADMIN')` (GET `/`).
  - Linha 10: `requireRole('DONO')` → `requireRole('DONO', 'ADMIN')` (POST `/`).
  - Linha 11: `requireRole('DONO')` → `requireRole('DONO', 'ADMIN')` (DELETE `/:id`).
- Notes/Constraints:
  - Idêntico ao arquivo anterior.
- Reuse:
  - Mesmo padrão de `barbearia-backend/src/routes/admin.routes.ts:14`.

### `barbearia-backend/src/routes/user.routes.ts`
- Changes:
  - Linha 9 (comentário): atualizar de
    `// CRUD de usuários (clientes/barbeiros/donos) restrito ao papel DONO.` para deixar claro
    que `DONO` e `ADMIN` podem chamar a API (a regra de quais papéis são *gerenciáveis* pelo CRUD
    não muda — continua só `CLIENTE`/`BARBEIRO`/`DONO`, ver `userService.ts`).
  - Linha 11: `requireRole('DONO')` → `requireRole('DONO', 'ADMIN')` (GET `/`).
  - Linha 12: `requireRole('DONO')` → `requireRole('DONO', 'ADMIN')` (GET `/:id`).
  - Linha 13: `requireRole('DONO')` → `requireRole('DONO', 'ADMIN')` (POST `/`).
  - Linha 14: `requireRole('DONO')` → `requireRole('DONO', 'ADMIN')` (PUT `/:id`).
- Notes/Constraints:
  - Não tocar em `userService.ts` — `MANAGEABLE_ROLES` continua `['CLIENTE', 'BARBEIRO', 'DONO']`;
    `ADMIN` pode *chamar* o CRUD mas os papéis *geríveis* continuam os mesmos (fora de escopo,
    decisão do Epic 4).
- Reuse:
  - Mesmo padrão de `barbearia-backend/src/routes/admin.routes.ts:14`.

### `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx`
- Changes:
  - Linha 6: `<ProtectedRoute allowedUserType={['dono']}>` →
    `<ProtectedRoute allowedUserType={['dono', 'admin']}>`.
- Notes/Constraints:
  - `ProtectedRoute` já suporta array de `UserType`; `'admin'` já é um valor válido de
    `UserType` em `AuthContext.tsx:7`.
- Reuse:
  - Mesmo padrão de `barbearia-shelby-frontend/src/app/barber/layout.tsx:6`
    (`allowedUserType={['barbeiro', 'dono', 'admin']}`).

### `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx`
- Changes:
  - Linha 6: `<ProtectedRoute allowedUserType={['dono']}>` →
    `<ProtectedRoute allowedUserType={['dono', 'admin']}>`.
- Notes/Constraints:
  - Idêntico ao arquivo anterior.
- Reuse:
  - Mesmo padrão de `barbearia-shelby-frontend/src/app/barber/layout.tsx:6`.

### `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`
- Changes:
  - Linha 51: `{auth.user?.userType === 'dono' && (` (bloco do link "Configurações") →
    `{(auth.user?.userType === 'dono' || auth.user?.userType === 'admin') && (`.
  - Linha 56: `{auth.user?.userType === 'dono' && (` (bloco do link "Usuários") →
    `{(auth.user?.userType === 'dono' || auth.user?.userType === 'admin') && (`.
- Notes/Constraints:
  - Manter os dois blocos JSX como estão (só a condição muda); não extrair helper novo — o
    componente já é pequeno e as duas condições ficam lado a lado, extrair uma função só para
    isso seria escopo além do pedido (Spec pede mudança mínima).
- Reuse:
  - N/A (mudança local, direta).

## Files to Create
Nenhum arquivo novo é necessário para este epic.

## Implementation Order (recommended)
1. `barbearia-backend/src/routes/businessHours.routes.ts`
2. `barbearia-backend/src/routes/holiday.routes.ts`
3. `barbearia-backend/src/routes/user.routes.ts`
4. `barbearia-backend/` → `npm run build` (Automated Verification Phase 1)
5. `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx`
6. `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx`
7. `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`
8. `barbearia-shelby-frontend/` → `npm run build` + `npx eslint src` (Automated Verification
   Phase 2)

## Validation (commands / checks)
- `cd barbearia-backend && npm run build`
- `cd barbearia-shelby-frontend && npm run build`
- `cd barbearia-shelby-frontend && npx eslint src`
- Chamadas reais de API (curl) com token de cada papel (`dono`, `admin`, `barbeiro`, `cliente`)
  contra `GET /api/business-hours`, `GET /api/holidays`, `GET /api/users`.
- Walkthrough em navegador real (login por papel) cobrindo `/barber/configuracoes` e
  `/barber/usuarios`, mais as 7 rotas da regra transversal do roadmap.

## Notes
- Mudança 100% aditiva e reversível — nenhum papel perde acesso que já tinha.
- Nenhuma migration de banco é necessária (sem alteração de `schema.prisma`).

---
