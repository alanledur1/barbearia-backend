# Master password para login em ambiente de desenvolvimento — Implementation Plan

## Overview
Adicionar uma senha mestra opcional (`MASTER_PASSWORD`) que, fora de produção, autentica como qualquer usuário existente no login atual. O objetivo é agilizar QA e reprodução de bugs por papel (RBAC) sem mexer em senhas reais. O recurso fica desligado por padrão, é sempre ignorado com `NODE_ENV=production` e loga cada uso.

## Scope
### In Scope
- Helper `src/utils/masterPassword.ts` e integração em `AuthService.login`.
- Log de status no boot e de cada uso.
- Testes unitários (Jest).
- Wiring da variável em `.env.example` (backend/infra) e `docker-compose.dev.yml`; docs.

### Out of Scope
- Schema/migrations, rotas, contrato da API, frontend, `AuditLog`, produção, definição do valor real da variável.

## Current State (from codebase)
- `src/services/auth.service.ts` — `AuthService.login` valida senha com `bcrypt.compare`, depois checa `active`, depois emite JWT de 8h.
- `src/routes/index.ts:23` — `POST /api/login` e `src/routes/auth.routes.ts` — `POST /api/auth/login`; ambos usam `AuthService.login`.
- `src/server.ts` — boot do servidor.
- `Dockerfile`, `DEPLOY_NORTHFLANK.md`, infra `docker-compose.yml` — produção usa `NODE_ENV=production`; infra `docker-compose.dev.yml` usa `NODE_ENV: development`.
- Nenhuma referência a master password existe hoje.

## Desired End State
Em dev, com `MASTER_PASSWORD` definido (≥ 12 caracteres), o login pelo frontend aceita essa senha para qualquer email existente e ativo. Senhas reais continuam funcionando. Em produção, ou sem a variável, nada muda.

## References
- PRD: `SDD/PRD/2026-09-26-master-password-dev.md`
- Spec: `SDD/SPEC/2026-09-26-master-password-dev.md`
- Key code references:
  - `src/services/auth.service.ts` — `login`
  - `src/server.ts`
  - `src/middlewares/error.middleware.ts:44` — critério `NODE_ENV === 'production'`
  - `../barbearia-shelby-infra/docker-compose.dev.yml`

---

## Phase 1: Helper e integração no login
### Tasks
- [x] Criar `src/utils/masterPassword.ts` (status, match em tempo constante, log de status)
- [x] Criar `src/utils/masterPassword.test.ts`
- [x] Integrar `matchesMasterPassword` em `AuthService.login` com log de uso
- [x] Criar `src/services/auth.service.test.ts` (prisma mockado)
- [x] Chamar `logMasterPasswordStatus()` em `src/server.ts`

### Success Criteria
#### Automated Verification
- [x] `npm run build`
- [x] `npm test`

#### Manual Verification
- [ ] Com `MASTER_PASSWORD` configurado no `.env` de dev, logar no frontend como um usuário seed usando a master password
- [ ] Confirmar o log `[MasterPassword] ... ATIVO` no boot e o log de uso no login
- [ ] Confirmar que a senha real do usuário continua funcionando

---

## Phase 2: Configuração e documentação
### Tasks
- [x] `MASTER_PASSWORD=` em `barbearia-backend/.env.example`
- [x] Atualizar `CLAUDE.md` (variáveis + rotas)
- [x] Nota em `DEPLOY_NORTHFLANK.md` (não configurar em produção)
- [x] `MASTER_PASSWORD=` em `barbearia-shelby-infra/.env.example`
- [x] Repassar `MASTER_PASSWORD` no `backend` de `barbearia-shelby-infra/docker-compose.dev.yml`

### Success Criteria
#### Automated Verification
- [x] `npm run build` (backend)
- [x] `docker compose -f docker-compose.dev.yml config` (infra)

#### Manual Verification
- [ ] Definir o valor real de `MASTER_PASSWORD` no `.env` local / infra (responsabilidade do usuário)
- [ ] Subir `docker compose -f docker-compose.dev.yml up --build` e repetir a verificação da Phase 1

---

## Testing Notes
- Unit tests: `src/utils/masterPassword.test.ts` (regras de habilitação e comparação), `src/services/auth.service.test.ts` (login com prisma mockado).
- Integration tests: não há infraestrutura de banco nos testes Jest atuais; coberto por mocks.
- Manual steps: 1) definir `MASTER_PASSWORD` (≥ 12 caracteres) no `.env`; 2) `npm run dev`; 3) ver o log de ativo no boot; 4) `POST /api/login` com email de um usuário seed + master password → 200 com token; 5) repetir com `NODE_ENV=production` → 401.

## Migration Notes
- Não se aplica: nenhuma alteração de schema Prisma.

## Rollout Notes
- Produção: não configurar a variável; mesmo configurada, é ignorada com `NODE_ENV=production` e gera aviso no boot.
- Contrato da API inalterado; frontend não precisa de mudança.
