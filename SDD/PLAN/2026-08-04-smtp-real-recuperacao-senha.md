# Envio de email real via SMTP + recuperação de senha — Implementation Plan

## Overview
Vamos sair do estado atual (dependências `nodemailer`/`resend` instaladas e não usadas, `email.service.ts`
vazio, zero endpoint de backend, fluxo "Esqueci Senha" 100% mockado no frontend) para um serviço de
email real via SMTP configurável por `.env`, com fallback automático para Ethereal quando não há
credencial real disponível. O foco obrigatório é fechar o fluxo de recuperação de senha ponta a
ponta, reusando o model `Otp` que já existe no schema Prisma (migration já aplicada) mas nunca foi
consumido por código. Como escopo adicional de baixo risco, cobrimos também confirmação de
agendamento e boas-vindas no cadastro de cliente — os dois pontos citados como exemplo no epic e
com dado de email já disponível no fluxo atual.

## Scope
### In Scope
- `EmailService` real (SMTP + fallback Ethereal) em `src/notifications/email.service.ts`.
- 3 rotas novas em `/api/auth`: `forgot-password`, `verify-reset-otp`, `reset-password`.
- Reuso do model `Otp` já existente (sem migration nova).
- Frontend `EsqueciSenha` (página + 3 componentes) chamando a API real.
- Email de confirmação de agendamento e de boas-vindas no cadastro de cliente (fire-and-forget).
- `.env.example` novo, `.env` atualizado, `CLAUDE.md` do backend atualizado.

### Out of Scope
- Qualquer migration Prisma nova.
- Boas-vindas no cadastro de staff (`AuthService.register`).
- WhatsApp, auditoria, filas (Epic 11).
- Rate limiting dedicado.
- Remoção da dependência `resend` (permanece instalada e não usada).
- Configuração de credencial SMTP de produção no Northflank.

## Current State (from codebase)
- `barbearia-backend/src/notifications/email.service.ts` — vazio (0 bytes).
- `barbearia-backend/src/routes/auth.routes.ts:14-20` — só `/register` (staff, autenticado) e `/login`.
- `barbearia-backend/prisma/schema.prisma:66-72` (schema ativo — caminho default do Prisma CLI,
  confirmado via `Grep`/`cat` direto; `src/prisma/schema.prisma` é um arquivo morto/legado com
  `Admin`/`Client`, não usado) — model `Otp` já existe (`email`, `code`, `expiresAt`, `createdAt`),
  migration `20260512222028_add_otp_table` já aplicada, zero uso em `src/`.
- `barbearia-backend/src/services/auth.service.ts` — `AuthService` com `register`/`login`/`findById`,
  usa `bcryptjs` + `prisma.user` + `signUserToken`.
- `barbearia-shelby-frontend/src/app/EsqueciSenha/page.tsx:13-32` — 3 handlers mock
  (`console.log`/`alert`, sem `api.post` nenhum).
- `barbearia-shelby-frontend/src/components/EsqueciSenha/OtpVerification.tsx:10,54` — 6 inputs
  numéricos (não 3), link "Reenviar" com `href=""` vazio, sem prop `email`.
- `barbearia-backend/src/services/appointmentService.ts:296-307` — `createAppointment` já retorna
  `client`/`service`/`admin` via `include`, sem disparo de notificação.
- `barbearia-backend/src/services/clientService.ts:9-39` — `ClientService.register` cria o `User`,
  sem disparo de notificação.
- `barbearia-backend/.env` — tem `EMAIL_USER`/`EMAIL_PASS` (placeholders, nunca lidos por código).

## Desired End State
- Um usuário que esqueceu a senha consegue: pedir o código em `/EsqueciSenha`, receber um código de
  6 dígitos por email (real ou via preview Ethereal), digitar o código, definir nova senha, e logar
  com ela em `/Login`.
- Um agendamento criado (cliente logado ou convidado) dispara um email de confirmação sem atrasar a
  resposta da API.
- Um cadastro novo de cliente dispara um email de boas-vindas sem atrasar a resposta da API.
- `.env.example` documenta todas as variáveis esperadas, sem valores.
- Nenhuma credencial real é commitada.

## References
- PRD: `barbearia-backend/SDD/PRD/2026-08-04-smtp-real-recuperacao-senha.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-08-04-smtp-real-recuperacao-senha.md`
- Key code references:
  - `barbearia-backend/src/services/auth.service.ts` — onde os 3 métodos de domínio entram.
  - `barbearia-backend/src/routes/auth.routes.ts` — onde as 3 rotas novas entram.
  - `barbearia-shelby-frontend/src/app/EsqueciSenha/page.tsx` — orquestrador do fluxo no frontend.

---

## Phase 1: EmailService real (SMTP + fallback Ethereal)
### Tasks
- [x] Implementar `EmailService` em `src/notifications/email.service.ts`: transporte lazy/singleton,
  SMTP real via `SMTP_HOST/PORT/USER/PASS/FROM` quando `SMTP_HOST` definido, fallback automático
  `nodemailer.createTestAccount()` (Ethereal) quando não definido, com log de preview URL.
- [x] Métodos: `sendPasswordResetOtp`, `sendAppointmentConfirmation`, `sendWelcomeEmail` (ver Spec
  para assunto/corpo/parâmetros de cada um).
- [x] Criar `.env.example` no backend (só nomes de variável, sem valor).
- [x] Atualizar `.env` local: trocar `EMAIL_USER`/`EMAIL_PASS` por `SMTP_HOST/PORT/USER/PASS/FROM`
  (vazios — aciona fallback Ethereal).
- [x] Atualizar `barbearia-backend/CLAUDE.md` (seção Variáveis de Ambiente e seção Rotas).

### Success Criteria
#### Automated Verification
- [x] `npm run build` (backend) compila sem erro.
- [x] Import de `nodemailer` resolve sem erro de tipo (`@types` não necessário — nodemailer 7 já
  publica seus próprios tipos).

#### Manual Verification
- [ ] Rodar um script/endpoint temporário (ou o fluxo real da Phase 2) e confirmar no console que,
  sem `SMTP_HOST` setado, o fallback Ethereal é acionado e uma preview URL é logada.

---

## Phase 2: Rotas de recuperação de senha (backend)
### Tasks
- [x] Criar `src/schemas/auth.schemas.ts` com `forgotPasswordSchema`, `verifyResetOtpSchema`,
  `resetPasswordSchema` (Zod, padrão `z.object({ body: z.object({...}) })`).
- [x] Adicionar `forgotPassword`, `verifyResetOtp`, `resetPassword` em `AuthService`
  (`src/services/auth.service.ts`), operando sobre `prisma.user` + `prisma.otp`.
- [x] Adicionar `forgotPassword`, `verifyResetOtp`, `resetPassword` em `AuthController`
  (`src/controllers/auth.controller.ts`).
- [x] Adicionar as 3 rotas públicas em `src/routes/auth.routes.ts` (`POST /forgot-password`,
  `POST /verify-reset-otp`, `POST /reset-password`), com `validate(...)` e sem `authMiddleware`.

### Success Criteria
#### Automated Verification
- [x] `npm run build` (backend) compila sem erro.
- [x] Testado manualmente via HTTP (curl/Postman ou browser E2E na Phase 5) — ver Manual Verification.

#### Manual Verification
- [ ] `POST /api/auth/forgot-password` com email existente cria um `Otp` no banco e dispara o email
  (confirmar via log/preview Ethereal).
- [ ] `POST /api/auth/forgot-password` com email inexistente retorna 200 genérico, sem revelar a
  ausência do usuário, e não cria nenhum `Otp`.
- [ ] `POST /api/auth/verify-reset-otp` com código certo retorna 200; com código errado/expirado
  retorna 400.
- [ ] `POST /api/auth/reset-password` com código válido troca a senha, apaga o(s) `Otp` do email, e
  login subsequente com a senha antiga falha e com a nova funciona.
- [ ] Reenviar (`forgot-password` de novo) invalida o código anterior (código antigo deixa de ser
  aceito por `verify-reset-otp`).

---

## Phase 3: Confirmação de agendamento e boas-vindas no cadastro
### Tasks
- [x] `AppointmentController.create` — disparo fire-and-forget de `sendAppointmentConfirmation`
  usando `client?.email ?? guestEmail`, sem `await` bloqueando a resposta 201.
- [x] `ClientController.register` — disparo fire-and-forget de `sendWelcomeEmail`, sem `await`
  bloqueando a resposta 201.

### Success Criteria
#### Automated Verification
- [x] `npm run build` (backend) compila sem erro.

#### Manual Verification
- [ ] Criar um agendamento com email de convidado (ou cliente logado com email) dispara o email de
  confirmação, confirmado via log/preview Ethereal, sem atrasar perceptivelmente a resposta da API.
- [ ] Cadastrar uma nova conta em `/CriarConta` dispara o email de boas-vindas, confirmado via
  log/preview Ethereal.

---

## Phase 4: Frontend — EsqueciSenha real
### Tasks
- [ ] `OtpVerification.tsx` — prop `email` (usada no texto informativo), prop `onResend`
  (substitui o `href=""` morto), prop `apiError` (mensagem de erro da API).
- [ ] `NovaSenha.tsx` — prop `apiError`, mesma precedência de exibição de `CriarConta.tsx`.
- [ ] `EsqueciSenha/page.tsx` — os 3 handlers passam a chamar `api.post('/auth/...')` (ver Spec para
  payload de cada chamada), com loading/erro tratados, `handleResendCode` novo, mensagem de sucesso
  final substituindo o `alert()` (mesmo padrão de `CriarConta/page.tsx`: banner fixo + redirect para
  `/Login`).

### Success Criteria
#### Automated Verification
- [ ] `npm run build` (frontend) gera todas as rotas sem erro.
- [ ] `npx eslint src/app/EsqueciSenha src/components/EsqueciSenha` limpo.

#### Manual Verification
- [ ] Fluxo completo via browser: email → código (recebido via preview Ethereal) → nova senha →
  redirect para `/Login` → login com a nova senha funciona.
- [ ] "Reenviar" funciona de verdade (gera novo código, código antigo passa a ser rejeitado).
- [ ] Código errado/expirado mostra mensagem de erro inline, sem quebrar a tela.
- [ ] Regra transversal: visitante/cliente não-logado continuam acessando `/EsqueciSenha` e as
  demais páginas públicas (`/`, `/Servicos`, `/Login`, `/CriarConta`, `/agendamento`,
  `/meus-servicos`) sem nenhuma mudança de layout/comportamento fora do fluxo desta feature.

---

## Testing Notes
- Unit tests: não há suíte de teste de backend configurada no projeto (fora de escopo criar uma
  nesta execução, consistente com epics anteriores).
- Integration tests: não há suíte de teste de integração de API — validação é via chamada HTTP real
  (curl/browser) descrita nas Manual Verification acima.
- Manual steps: 1) rodar backend + frontend localmente; 2) percorrer o fluxo completo de
  `/EsqueciSenha` via browser; 3) confirmar preview Ethereal de cada email disparado (reset,
  agendamento, boas-vindas); 4) confirmar login com a nova senha.

## Migration Notes
- Não aplicável — nenhuma alteração de schema Prisma é necessária nesta feature. O model `Otp` já
  existe e já está migrado (`prisma/migrations/20260512222028_add_otp_table`). Se qualquer fase
  revelar necessidade de schema novo durante a implementação, a regra do projeto é usar
  `npx prisma migrate dev` (Prisma 7, não Flask-Migrate/Alembic), seguindo expand/contract e as
  regras de `DEPLOY_NORTHFLANK.md`/`CLAUDE.md` do backend — mas isso não é esperado neste plano.

## Rollout Notes
- Produção (Northflank) precisa de credencial SMTP real configurada nas variáveis de ambiente do
  serviço — fora do escopo desta execução local, documentar como pendência explícita.
