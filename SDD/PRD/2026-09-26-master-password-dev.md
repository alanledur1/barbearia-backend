# PRD — Master password para login em ambiente de desenvolvimento

## 1) Objetivo
- Permitir que, em ambiente de desenvolvimento/QA, qualquer conta existente (CLIENTE, BARBEIRO, DONO, ADMIN) seja acessada com uma senha única ("master password") definida por variável de ambiente, sem precisar conhecer/resetar a senha real de cada usuário.
- Valor: agiliza testes manuais de fluxos por papel (RBAC), reprodução de bugs relatados por um usuário específico e QA com base de dados copiada, sem mexer em senhas reais.

## 2) Escopo
**Inclui**
- Nova variável de ambiente `MASTER_PASSWORD` (opcional; ausente = recurso desligado).
- Aceitar `MASTER_PASSWORD` como senha válida no login existente (`AuthService.login`), que atende tanto `POST /api/login` (login unificado) quanto `POST /api/auth/login`.
- Travas de segurança: desligado sempre que `NODE_ENV=production`; desligado se o valor tiver menos de 12 caracteres; comparação em tempo constante.
- Log de aviso no boot (status do recurso) e a cada login feito via master password.
- Wiring da variável em `.env.example` (backend e infra) e em `docker-compose.dev.yml` (infra); documentação em `CLAUDE.md` e `DEPLOY_NORTHFLANK.md`.
- Testes unitários (Jest) do utilitário e do comportamento de login.

**Não inclui (fora de escopo)**
- Qualquer alteração de schema Prisma / migration.
- Qualquer alteração de contrato da API (payload, rotas, status codes) ou no frontend.
- Registro em `AuditLog` (o `AuditService` só conhece os módulos `USERS`/`BUSINESS_HOURS`/`HOLIDAYS`/`PLANS`, expostos na tela de configurações; adicionar um módulo `AUTH` mexeria no frontend).
- Master password em produção, impersonação por token ("login como"), bypass de conta desativada, fluxo de recuperação de senha.
- Definir o valor real da variável (feito pelo usuário posteriormente).

## 3) Fluxo atual (como funciona hoje)
- `src/routes/index.ts:23` — `POST /api/login` → `UnifiedLoginController.login` (`src/controllers/unifiedLogin.controller.ts`).
- `src/routes/auth.routes.ts` — `POST /api/auth/login` → `AuthController.login` (`src/controllers/auth.controller.ts`).
- Ambos chamam `AuthService.login(email, password)` (`src/services/auth.service.ts`):
  1. `prisma.user.findUnique({ where: { email } })` — não existe → `Error("Invalid credentials.")`.
  2. `bcrypt.compare(password, user.password)` — falso → `Error("Invalid credentials.")`.
  3. `user.active === false` → `CustomError(..., 401)` (checado depois da senha para não vazar status da conta).
  4. `signUserToken({ userId, role, email }, "8h")` (`src/utils/jwt.ts`) e retorna `{ token, user }`.
- Não existe hoje nenhum conceito de master password (busca por `master`, `MASTER_PASSWORD`, `superadmin`, `bypass` em backend, frontend, infra e histórico git: zero ocorrências).

## 4) Fluxo desejado (comportamento esperado)
- Com `MASTER_PASSWORD` definido (≥ 12 caracteres) e `NODE_ENV` diferente de `production`:
  - Login com email de usuário existente + senha real → funciona como hoje.
  - Login com email de usuário existente + `MASTER_PASSWORD` → autentica como aquele usuário (mesmo token/resposta de um login normal) e gera log de aviso.
  - Email inexistente → continua "Invalid credentials" (a master password não cria usuário).
  - Conta desativada → continua bloqueada (401), mesmo com a master password.
- Com `MASTER_PASSWORD` ausente, curto demais, ou `NODE_ENV=production` → comportamento idêntico ao atual; a master password é tratada como senha errada.
- No boot, o servidor loga se o recurso está ativo, ignorado por estar em produção, ou ignorado por valor curto.

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `src/routes/index.ts:23` — `POST /api/login` (unificado; usado pelo frontend).
- `src/routes/auth.routes.ts` — `POST /api/auth/login`.
- `src/controllers/unifiedLogin.controller.ts`, `src/controllers/auth.controller.ts` — só repassam para `AuthService.login`; nenhuma mudança necessária.

### 5.2 Domínio / Regras / Serviços
- `src/services/auth.service.ts` — `AuthService.login`: ponto único onde a senha é validada.
- `src/utils/jwt.ts` — geração do token (inalterado).
- `src/server.ts` — boot do servidor; local para logar o status do recurso.

### 5.3 Persistência / Modelos / Migrações
- `prisma/schema.prisma` model `User` (`password`, `role`, `active`) — somente leitura; **sem migration**.

### 5.4 Integrações externas
- Nenhuma. Usa apenas `crypto` nativo do Node (`createHash`, `timingSafeEqual`).

### 5.5 UI / Componentes
- Nenhuma mudança: o frontend já envia email/senha para `/api/login`.

### 5.6 Testes / Fixtures
- `jest.config.js` — `ts-jest`, `testMatch: **/src/**/*.test.ts`.
- `src/app.test.ts` — único teste existente (smoke `/healthz`).

### 5.7 Configuração / Infra
- `barbearia-backend/.env.example` — template de variáveis.
- `barbearia-shelby-infra/.env.example`, `docker-compose.dev.yml` (`NODE_ENV: development`), `docker-compose.yml` (`NODE_ENV: production`), `docker-compose.test.yml` (`NODE_ENV: test`).
- `barbearia-backend/Dockerfile` — imagem de produção define `ENV NODE_ENV=production`.
- `DEPLOY_NORTHFLANK.md` — Northflank com `NODE_ENV=production`.

## 6) Padrões existentes para reuso
- `src/utils/*.ts` (`jwt.ts`, `hash.ts`) — funções utilitárias puras exportadas; o novo helper segue o mesmo formato.
- Leitura de env direto via `process.env` (padrão de `email.service.ts`, `jwt.ts`).
- Logs com prefixo entre colchetes (`[Scheduler]`, `[AuditService]`) — usar `[MasterPassword]`.
- `src/middlewares/error.middleware.ts:44` — já usa `process.env.NODE_ENV === 'production'` como critério de produção.

## 7) Documentação externa
- Node.js `crypto.timingSafeEqual` exige buffers de mesmo tamanho; por isso ambos os lados são normalizados com `sha256` antes da comparação (evita também vazar o tamanho do segredo). Nenhuma lib nova.

## 8) Impactos prováveis
- Backend: `auth.service.ts`, novo `utils/masterPassword.ts`, `server.ts`, testes novos.
- Config/docs: `.env.example`, `CLAUDE.md`, `DEPLOY_NORTHFLANK.md`.
- Infra: `.env.example`, `docker-compose.dev.yml`.
- Frontend: nenhum. Contrato da API: inalterado.

## 9) Critérios de aceitação
- [ ] Em dev, com `MASTER_PASSWORD` configurado, é possível logar como qualquer usuário existente usando essa senha, pelo `/api/login`.
- [ ] A senha real de cada usuário continua funcionando normalmente.
- [ ] Com `NODE_ENV=production`, a master password não autentica, mesmo configurada.
- [ ] Sem `MASTER_PASSWORD` (ou com menos de 12 caracteres), nada muda no comportamento do login.
- [ ] Conta desativada continua bloqueada.
- [ ] Todo login via master password gera log `[MasterPassword]` com id/email/role do usuário.
- [ ] `npm run build` e `npm test` passam.

## 10) Open Questions
- Nenhuma. Decisões tomadas com defaults seguros (usuário delegou; valor da variável será configurado por ele depois):
  - Guard de ambiente: bloqueado apenas em `NODE_ENV=production` (permite `npm run dev` local sem `NODE_ENV` definido).
  - Vale para todos os papéis, inclusive CLIENTE.
  - Tamanho mínimo: 12 caracteres.
  - Sem registro em `AuditLog` (só log de console).
