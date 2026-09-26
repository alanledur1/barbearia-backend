# Spec — Master password para login em ambiente de desenvolvimento

## Objective
- Aceitar `MASTER_PASSWORD` (env) como senha válida para qualquer usuário existente em `AuthService.login`, apenas fora de produção.
- Deixar a variável documentada e repassada no ambiente dev (backend + infra), sem definir valor.

## Scope
**In**
- Backend: `src/utils/masterPassword.ts` (novo), `src/utils/masterPassword.test.ts` (novo), `src/services/auth.service.ts`, `src/services/auth.service.test.ts` (novo), `src/server.ts`, `.env.example`, `CLAUDE.md`, `DEPLOY_NORTHFLANK.md`.
- Infra: `barbearia-shelby-infra/.env.example`, `barbearia-shelby-infra/docker-compose.dev.yml`.

**Out**
- Schema Prisma / migrations, rotas, controllers, contrato da API, frontend, `AuditService`, `docker-compose.yml` (prod) e `docker-compose.test.yml`.

## Decision Log
- Guard de produção: `NODE_ENV === 'production'` desliga o recurso (mesmo critério de `src/middlewares/error.middleware.ts:44`). Dockerfile de prod, Northflank e `docker-compose.yml` já definem `NODE_ENV=production`.
- Tamanho mínimo: 12 caracteres; abaixo disso o recurso fica desligado (evita senha mestra fraca por engano).
- Comparação: `sha256` dos dois lados + `crypto.timingSafeEqual` (tempo constante, sem vazar tamanho).
- Ordem: `bcrypt.compare` primeiro; master password só é checada se a senha real falhar. Checagem de `active` continua depois, para ambos os caminhos.
- Todos os papéis (CLIENTE, BARBEIRO, DONO, ADMIN). Resposta/token idênticos ao login normal → contrato inalterado.
- Observabilidade: `console.warn` com prefixo `[MasterPassword]` no boot e em cada uso (sem logar o valor da senha). Sem `AuditLog`.

## Files to Create

### `src/utils/masterPassword.ts`
- Purpose: regra única de habilitação/validação da master password.
- Contents:
  - `export const MASTER_PASSWORD_MIN_LENGTH = 12;`
  - `export type MasterPasswordStatus = 'disabled' | 'enabled' | 'ignored_production' | 'ignored_too_short';`
  - `export function getMasterPasswordStatus(env: NodeJS.ProcessEnv = process.env): MasterPasswordStatus` — `MASTER_PASSWORD` vazio/ausente → `disabled`; `NODE_ENV === 'production'` → `ignored_production`; tamanho < mínimo → `ignored_too_short`; senão `enabled`.
  - `export function matchesMasterPassword(candidate: string, env = process.env): boolean` — `false` se status ≠ `enabled` ou candidato não for string; senão `timingSafeEqual(sha256(candidate), sha256(MASTER_PASSWORD))`.
  - `export function logMasterPasswordStatus(env = process.env): void` — `enabled` → `console.warn` avisando que está ATIVO; `ignored_production`/`ignored_too_short` → `console.warn` explicando por que foi ignorado; `disabled` → silencioso.
- Integration points: `auth.service.ts` (`matchesMasterPassword`), `server.ts` (`logMasterPasswordStatus`).

### `src/utils/masterPassword.test.ts`
- Purpose: testes unitários puros (env injetado, sem mutar `process.env`).
- Casos: status para ausente/produção/curto/válido; match com senha correta; não-match com senha errada, em produção, curta, ausente.

### `src/services/auth.service.test.ts`
- Purpose: testar `AuthService.login` com `prisma` mockado (`jest.mock('./prisma.service')`) e `bcryptjs` real (hash gerado no teste).
- Casos: senha real funciona; master password funciona em dev e loga `[MasterPassword]`; master password falha em produção; email inexistente falha; conta inativa com master password → `CustomError` 401.
- Notes: salvar/restaurar `process.env.MASTER_PASSWORD` e `NODE_ENV` em `beforeEach`/`afterEach`; `jest.mock('../notifications/email.service')` para não carregar nodemailer.

## Files to Modify

### `src/services/auth.service.ts`
- Changes:
  - Importar `matchesMasterPassword` de `../utils/masterPassword`.
  - Em `login`: após `bcrypt.compare`, `const isMasterLogin = !isPasswordValid && matchesMasterPassword(passwordPlain);` e falhar com `Invalid credentials.` se `!isPasswordValid && !isMasterLogin`.
  - Após a checagem de `active`, se `isMasterLogin`: `console.warn('[MasterPassword] Login via master password: userId=<id> email=<email> role=<role>')`.
- Notes/Constraints: não alterar retorno, mensagens nem ordem da checagem de `active`.

### `src/server.ts`
- Changes: importar `logMasterPasswordStatus` e chamá-lo uma vez no boot (antes de `app.listen`).

### `.env.example`
- Changes: adicionar bloco comentado com `MASTER_PASSWORD=` (vazio), explicando que é só dev, mínimo 12 caracteres e ignorado em produção.

### `CLAUDE.md`
- Changes: incluir `MASTER_PASSWORD=` na seção de variáveis, com nota curta do comportamento; mencionar em "Rotas" que o login aceita master password fora de produção; atualizar data.

### `DEPLOY_NORTHFLANK.md`
- Changes: nota em "Variaveis de ambiente": não configurar `MASTER_PASSWORD` em produção (é ignorado com `NODE_ENV=production`).

### `barbearia-shelby-infra/.env.example`
- Changes: adicionar `MASTER_PASSWORD=` (vazio) na seção Backend, com comentário "só dev".

### `barbearia-shelby-infra/docker-compose.dev.yml`
- Changes: em `backend.environment`, adicionar `MASTER_PASSWORD: ${MASTER_PASSWORD:-}`.
- Notes: NÃO adicionar em `docker-compose.yml` (prod) nem `docker-compose.test.yml`.

## Implementation Order (recommended)
1. `src/utils/masterPassword.ts` + teste.
2. `src/services/auth.service.ts` + teste.
3. `src/server.ts`.
4. `.env.example`, `CLAUDE.md`, `DEPLOY_NORTHFLANK.md`.
5. Infra: `.env.example`, `docker-compose.dev.yml`.

## Validation (commands / checks)
- `npm run build` (backend)
- `npm test` (backend)
- `docker compose -f docker-compose.dev.yml config` (infra) — se Docker disponível.

## Notes
- Sem mudança de contrato da API → nada a sinalizar para o frontend.
- Sem mudança de schema Prisma.
