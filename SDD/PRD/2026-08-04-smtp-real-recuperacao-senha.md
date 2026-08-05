# PRD — Envio de email real via SMTP configurável por variáveis de ambiente, fechando o fluxo de recuperação de senha (hoje inteiramente mockado no frontend, sem endpoint no backend) e cobrindo outros pontos de notificação por email ainda inexistentes que a pesquisa identificar como necessários

## 1) Objetivo
- Sair do estado atual — `nodemailer`/`resend` instalados e não usados, `email.service.ts` vazio, zero rota de backend — para um serviço de email real, via SMTP, configurado por variáveis `SMTP_*` no `.env`.
- Fechar de ponta a ponta o fluxo de "Esqueci Senha" (hoje 100% mockado no frontend com `console.log`/`alert`, sem nenhuma rota no backend), usando o modelo `Otp` que já existe no schema Prisma mas nunca foi consumido por nenhum código.
- Cobrir, dentro do mesmo esforço, os dois outros pontos do sistema onde uma notificação por email faz sentido hoje e é de baixo risco/esforço: confirmação de agendamento e boas-vindas no cadastro de cliente.

## 2) Escopo

**Inclui**
- `EmailService` real em `src/notifications/email.service.ts`, usando `nodemailer.createTransport` com SMTP configurado por `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`.
- Fallback automático para conta de teste Ethereal (`nodemailer.createTestAccount`) quando `SMTP_HOST` não está definido — não bloqueia dev/QA por falta de credencial real, loga a preview URL do Ethereal no console do backend.
- 3 rotas novas em `POST /api/auth`: `forgot-password`, `verify-reset-otp`, `reset-password`, operando sobre o model unificado `User` (não `Client`/`Admin` legados, que não são mais usados em código).
- Reuso do model `Otp` já existente no schema (`email`, `code`, `expiresAt`) — sem alteração de schema/migration para o fluxo de reset. Código OTP numérico de 6 dígitos (mantendo o que a UI (`OtpVerification.tsx`) já implementa hoje — ver Open Questions / decisão já resolvida).
- Frontend: `EsqueciSenha/page.tsx` e os 3 componentes (`EmailRecuperacao.tsx`, `OtpVerification.tsx`, `NovaSenha.tsx`) passam a chamar a API real via `services/api.ts`, com loading/erro tratados, em vez de `console.log`/`alert`.
- `.env.example` novo no backend, só com nomes de variável (sem valor), incluindo as `SMTP_*` novas e as já existentes (`DATABASE_URL`, `JWT_SECRET`, `WHATSAPP_*`).
- Atualização de `barbearia-backend/CLAUDE.md`: seção "Variáveis de Ambiente" trocando `EMAIL_USER`/`EMAIL_PASS` (nunca consumidas por código) por `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`.
- Email de confirmação de agendamento (`AppointmentService.createAppointment`), disparado de forma não bloqueante (fire-and-forget com log de erro) após a criação, tanto para cliente logado quanto para convidado (guest), quando há email disponível.
- Email de boas-vindas no cadastro de cliente (`ClientService.register`, rota `POST /api/clients/signup`), também não bloqueante.

**Não inclui (fora de escopo)**
- Envio de email para criação de conta de staff (`AuthService.register`, `POST /api/auth/register`) — fluxo interno, criado por dono/admin autenticado, não fluxo de autoatendimento; menor valor para o esforço deste epic.
- WhatsApp (`whatsappService.ts`/`appointmentReminder.ts`) — scheduler já existe comentado, mas está fora do escopo deste epic (é matéria do Epic 11, que pode reaproveitar o transporte de email deste epic).
- Qualquer criação/alteração de tabela nova (`AuditLog`, filas) — isso é Epic 11.
- Rate limiting dedicado (ex. middleware de throttling por IP/email) — não existe hoje nenhum rate limiter no projeto (`src/middlewares/` só tem `auth`, `validate`, `requireRole`, `error`); mitigação mínima de abuso do fluxo de reset fica restrita a invalidar OTPs antigos ao gerar um novo e expiração curta (10 min) — ver Fluxo desejado.
- Uso de `resend` (dependência instalada, não usada) — a decisão de canal é SMTP via `nodemailer`, conforme o texto do epic; `resend` permanece instalado e não utilizado (fora de escopo remover dependências não pedidas).
- Verificação de email no cadastro (double opt-in) — fora de escopo, não pedido.
- Deploy/configuração de credenciais SMTP de produção no Northflank — fica como pendência documentada, não bloqueia o epic (ambiente local não tem credencial SMTP real disponível).

## 3) Fluxo atual (como funciona hoje)

**Esqueci Senha (frontend, 100% mock)**
- `barbearia-shelby-frontend/src/app/EsqueciSenha/page.tsx` — componente de página com state machine local (`step: 'email' | 'codigo' | 'senha'`), sem nenhuma chamada a `api`.
  - `handleEmailNext` (linha 13-18): recebe email, avança para step `codigo`, só faz `console.log('Enviar OTP para:', emailDigitado)`.
  - `handleCodigoVerificado` (linha 21-26): recebe código digitado, avança para step `senha`, só faz `console.log`.
  - `handleNovaSenha` (linha 29-32): `console.log('Enviar para API:', ...)` seguido de `alert('Senha alterada com sucesso!')` — nunca chama o backend.
- `src/components/EsqueciSenha/EmailRecuperacao.tsx` — formulário de email, chama `onNext(email)` no submit.
- `src/components/EsqueciSenha/OtpVerification.tsx` — 6 inputs de 1 dígito cada (`Array(6).fill("")`, linha 10), chama `onVerify(otp.join(""))` no submit. **Não recebe `email` como prop hoje** (a página não repassa). Link "Reenviar" (linha 54) tem `href=""` vazio, sem handler.
- `src/components/EsqueciSenha/NovaSenha.tsx` — formulário de nova senha + confirmação, validação client-side (mínimo 6 caracteres, senhas coincidem), chama `onSubmit(email, senha)` — **não envia o código OTP**, só email+senha.

**Backend — rotas de auth existentes**
- `src/routes/auth.routes.ts` — só `POST /register` (staff, autenticado, `requireRole('DONO','ADMIN')`) e `POST /login` (staff/geral, via `AuthController.login`). Nenhuma rota de reset de senha.
- `src/routes/index.ts` — `POST /api/login` (rota unificada, `UnifiedLoginController`, usada por `Login/page.tsx` para todos os papéis) e `router.use('/clients', clientRoutes)` com `POST /api/clients/signup` e `POST /api/clients/login` (fluxo de cadastro/login público de cliente, usado por `CriarConta/page.tsx`).
- `src/services/auth.service.ts` (`AuthService`) e `src/services/clientService.ts` (`ClientService`) — ambos operam sobre o mesmo model `User` (não há mais separação real `Client`/`Admin` em runtime), com `bcryptjs` (`bcrypt.hash(pw, 10)` / `bcrypt.compare`) e `signUserToken` (`src/utils/jwt.ts`) para emitir JWT.

**Schema/DB**
- `barbearia-backend/src/prisma/schema.prisma` está **desatualizado/morto** — ainda modela `Admin`/`Client` separados, sem `User`/`Otp`; não reflete o schema real. (Correção de pesquisa: uma leitura inicial havia atribuído isso ao arquivo errado — confirmado por `Grep`/`bash cat` diretos em ambos os arquivos, não por inferência.)
- `barbearia-backend/prisma/schema.prisma` (raiz, caminho convencional do Prisma) é o schema **ativo** — é o caminho default que o Prisma CLI resolve quando `prisma.config.ts` não declara um `schema:` explícito (só declara `migrations.seed` apontando pra `./src/prisma/seed.ts`, que é só o script de seed, não o schema). Confirmado por `prisma/migrations/*` (histórico com `rbac_user_unification`, `add_otp_table` etc. bate com este arquivo) e pelo Prisma Client gerado (`prisma.otp`/`prisma.user` resolvem sem erro de tipo — só possível se o client tiver sido gerado a partir deste schema).
  - Model `User` (linha 15-29): `id, name, email? @unique, phone?, password, role (UserRole: CLIENTE/BARBEIRO/DONO/ADMIN), active, createdAt, updatedAt`.
  - Model `Otp` (linha 66-72): `id, email (String, não indexado/único), code (String), expiresAt (DateTime), createdAt`. **Já existe migration aplicada** (`prisma/migrations/20260512222028_add_otp_table/migration.sql`) criando a tabela `Otp` — mas **nenhum arquivo em `src/` referencia `prisma.otp`** (busca por `Otp` em `src/` não retorna nenhum resultado de uso). Tabela existe no banco, mas está 100% órfã de código.

**Email**
- `src/notifications/email.service.ts` existe e está **vazio** (0 bytes).
- `nodemailer` (`^7.0.5`) e `resend` (`^6.3.0`) instalados em `package.json`, sem nenhum `import` em `src/`.
- Nenhuma variável `SMTP_*` existe no `.env` atual; existem `EMAIL_USER=seuemail@gmail.com` e `EMAIL_PASS=sua_senha_de_aplicativo` (valores placeholder, não reais), mas nenhum código do projeto lê essas duas variáveis.
- Nenhum outro touchpoint do sistema envia email hoje: `AppointmentService.createAppointment` (`src/services/appointmentService.ts:185-310`) cria o agendamento e retorna (com `client`/`guestEmail` disponíveis no retorno), sem disparar nenhuma notificação. `ClientService.register` (`src/services/clientService.ts:9-39`) cria o `User` e retorna, sem notificação.
- `src/schedulers/` (`whatsappService.ts`, `appointmentReminder.ts`, mencionados no roadmap) — scheduler comentado, fora do escopo.

## 4) Fluxo desejado (comportamento esperado)

**Recuperação de senha (fluxo principal, obrigatório)**
1. Usuário informa email em `EmailRecuperacao` → frontend chama `POST /api/auth/forgot-password { email }`.
   - Backend: se existe `User` com esse email, apaga quaisquer `Otp` anteriores para o mesmo email (evita múltiplos códigos válidos simultâneos), gera código numérico de 6 dígitos, cria `Otp { email, code, expiresAt: now+10min }`, envia email via `EmailService.sendPasswordResetOtp(email, code)`.
   - Resposta sempre genérica e sempre 200 ("se o email existir, enviaremos um código") independentemente de o email existir — evita enumeração de usuários. Frontend avança para o step `codigo` de qualquer forma.
2. Usuário digita o código de 6 dígitos em `OtpVerification` (que passa a receber `email` como prop, propagado desde `EsqueciSenhaPage`) → frontend chama `POST /api/auth/verify-reset-otp { email, code }`.
   - Backend valida: existe `Otp` para esse email+code, não expirado. Se válido, retorna 200 (sem consumir o registro ainda — a validação final e o consumo acontecem no passo 3, mesmo padrão implícito que o fluxo em 3 telas já pressupõe). Se inválido/expirado, 400 com mensagem para o usuário tentar de novo ou reenviar.
   - Link "Reenviar" chama de novo o endpoint de `forgot-password` com o mesmo email (reaproveita o passo 1, reinicia o código e o timer de expiração).
3. Usuário define nova senha em `NovaSenha` → frontend chama `POST /api/auth/reset-password { email, code, newPassword }`.
   - Backend revalida `Otp` (email+code+expiração) — mesma checagem do passo 2, agora de forma autoritativa. Se válido: hash da nova senha (`bcrypt.hash(.., 10)`, mesmo padrão de `AuthService`/`ClientService`), `prisma.user.update` no `password`, e apaga o(s) `Otp` daquele email (consumo, evita reuso do código). Se inválido, 400.
   - Frontend mostra sucesso e redireciona para `/Login` (troca o `alert()` atual por feedback inline, consistente com o padrão já usado em `CriarConta/page.tsx` — mensagem de sucesso + `router.push`).

**Confirmação de agendamento (escopo adicional)**
- Após `AppointmentService.createAppointment` criar o registro com sucesso, o controller (`AppointmentController.create`) dispara `EmailService.sendAppointmentConfirmation(...)` de forma **não bloqueante** (`.catch` que só loga erro, sem afetar a resposta 201 já enviada) — usa `appointment.client?.email` (cliente logado) ou `appointment.guestEmail` (convidado); se nenhum dos dois existir, não tenta enviar.

**Boas-vindas no cadastro (escopo adicional)**
- Após `ClientService.register` criar o `User`, o controller (`ClientController.register`) dispara `EmailService.sendWelcomeEmail(...)` de forma não bloqueante, mesmo padrão de fire-and-forget.

**Config de transporte (todos os casos)**
- `EmailService` monta o transporte no primeiro uso (lazy singleton): se `SMTP_HOST` está definido no `.env`, usa SMTP real (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, `SMTP_FROM` como remetente). Se não está definido (dev local sem credencial), cria automaticamente uma conta de teste Ethereal (`nodemailer.createTestAccount()`) e loga a preview URL de cada email enviado — permite validar o fluxo fim a fim sem credencial de produção.

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-backend/src/routes/auth.routes.ts` — adicionar `POST /forgot-password`, `POST /verify-reset-otp`, `POST /reset-password` (públicas, sem `authMiddleware`, mesmo padrão de `/login`).
- `barbearia-backend/src/controllers/auth.controller.ts` (`AuthController`) — novos métodos `forgotPassword`, `verifyResetOtp`, `resetPassword`.
- `barbearia-backend/src/controllers/appointment.controller.ts` (`AppointmentController.create`, linha 8-59) — dispara email de confirmação após `appointmentService.createAppointment(...)`.
- `barbearia-backend/src/controllers/clientController.ts` (`ClientController.register`, linha 15-35) — dispara email de boas-vindas após `this.clientService.register(...)`.
- `barbearia-shelby-frontend/src/app/EsqueciSenha/page.tsx` — troca os 3 handlers mock por chamadas reais via `api` (axios), com estado de loading/erro.
- `barbearia-shelby-frontend/src/components/EsqueciSenha/OtpVerification.tsx` — passa a receber `email` como prop e ganha handler de "Reenviar" (chama de novo o passo 1).

### 5.2 Domínio / Regras / Serviços
- `barbearia-backend/src/notifications/email.service.ts` (vazio hoje) — vira a `EmailService`: monta transporte (SMTP real ou Ethereal fallback), expõe `sendPasswordResetOtp`, `sendAppointmentConfirmation`, `sendWelcomeEmail`.
- `barbearia-backend/src/services/auth.service.ts` (`AuthService`) — candidato natural para os métodos de domínio `forgotPassword(email)`, `verifyResetOtp(email, code)`, `resetPassword(email, code, newPassword)` (já opera sobre `User`, já tem `bcrypt`/`prisma` importados, mesmo padrão de `register`/`login`).
- `barbearia-backend/src/services/appointmentService.ts` (`AppointmentService.createAppointment`) — não muda a lógica de negócio; o disparo do email fica no controller (fora da transação Prisma), para não acoplar o serviço de agendamento ao serviço de email nem falhar o agendamento por causa de SMTP fora do ar.
- `barbearia-backend/src/services/clientService.ts` (`ClientService.register`) — mesma lógica: disparo do email de boas-vindas fica no controller, não no serviço.

### 5.3 Persistência / Modelos / Migrações
- `barbearia-backend/prisma/schema.prisma` (raiz) — schema ativo (confirmado acima). Model `Otp` (linha 66-72) já existe e será reusado sem alteração de campos para o fluxo de reset (`email`, `code`, `expiresAt`).
- **Migrations**: projeto usa **Prisma 7** (`npx prisma migrate dev` / `npx prisma migrate deploy`), não Flask-Migrate/Alembic. Migration `20260512222028_add_otp_table` já criou a tabela `Otp` — nenhuma migration nova é necessária para o fluxo de reset, pois nenhum campo novo é preciso (consumo do OTP é feito por `delete`, não por coluna de status). Se a fase de planejamento decidir por um campo adicional (ex. índice em `email`), será uma migration aditiva simples (`CREATE INDEX`), sem risco.
- `barbearia-backend/src/prisma/schema.prisma` — schema morto/desatualizado (models `Admin`/`Client` sem uso em código); não deve ser tocado por este epic (fora de escopo diagnosticar/remover esse artefato órfão).

### 5.4 Integrações externas (clients/adapters/providers)
- `nodemailer` (`^7.0.5`, já em `package.json`) — biblioteca a usar. Ver seção 7 (Context7) para API de `createTransport`/`createTestAccount`.
- `resend` (`^6.3.0`, já em `package.json`) — instalado, não será usado (decisão: SMTP via nodemailer, conforme texto do epic). Permanece como dependência não utilizada, fora de escopo remover.
- `dotenv` (`^17.2.3`) — já carrega `.env` em `src/app.ts:11` (`dotenv.config()`) e `src/server.ts:1` (`import "dotenv/config"`); novas variáveis `SMTP_*` seguem o mesmo mecanismo, sem setup adicional.

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/app/EsqueciSenha/page.tsx` — orquestra os 3 steps, precisa importar `api` (`@/services/api`, mesmo padrão de `Login/page.tsx` e `CriarConta/page.tsx`) e tratar erro/loading.
- `barbearia-shelby-frontend/src/components/EsqueciSenha/EmailRecuperacao.tsx` — sem mudança estrutural; o `onNext` na página passa a ser `async`.
- `barbearia-shelby-frontend/src/components/EsqueciSenha/OtpVerification.tsx` — ganha prop `email`, handler de reenvio funcional (hoje `href=""` vazio), e exibição de erro (código inválido/expirado).
- `barbearia-shelby-frontend/src/components/EsqueciSenha/NovaSenha.tsx` — `onSubmit` na página passa a receber também o `code` (já disponível no state da página) para o `POST /reset-password`; a assinatura do componente em si (`onSubmit(email, senha)`) não muda — a página injeta o `codigo` do seu próprio state ao montar o payload da chamada `api`.
- `barbearia-shelby-frontend/src/app/EsqueciSenha/EsqueciSenha.module.css` — reuso de classes já existentes (`.error`, já usada em `NovaSenha.tsx`) para mensagens de erro de API; não deve precisar de classe nova.

### 5.6 Testes / Fixtures (se existirem)
- Não há teste automatizado (Jest/Testing Library/Cypress) cobrindo `EsqueciSenha` hoje — busca por `EsqueciSenha|OtpVerification|EmailRecuperacao|NovaSenha` em specs não retorna nada. Nenhum teste de backend (`auth.controller`/`auth.service`) existe hoje também — projeto não tem suíte de teste de backend configurada (`package.json` do backend não tem script `test`).

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-backend/src/services/auth.service.ts` — padrão de `bcrypt.hash(pw, 10)` / `bcrypt.compare` (via `bcryptjs`) e `signUserToken` — reusar exatamente o mesmo padrão de hash para `resetPassword`.
- `barbearia-backend/src/utils/customErrors.ts` (`CustomError`) — padrão de erro com `statusCode` já usado em `appointmentService`/`clientService`/`user.controller` — reusar para erros de OTP inválido/expirado/email não encontrado (quando aplicável internamente, mesmo que a resposta pública seja genérica).
- `barbearia-backend/src/middlewares/validate.middleware.ts` + padrão de schema em `src/schemas/*.ts` (ex. `admin.schemas.ts`, `clientSchema.ts`, ambos com `z.object({ body: z.object({...}) })`) — reusar para os 3 novos endpoints (`forgotPasswordSchema`, `verifyResetOtpSchema`, `resetPasswordSchema`).
- `barbearia-shelby-frontend/src/app/CriarConta/page.tsx` — padrão de chamada `api.post(...)` com `try/catch`, mensagem de erro genérica em `setError`, e mensagem de sucesso com `setTimeout` + `router.push` — replicar em `EsqueciSenhaPage` para o sucesso final do reset.
- `barbearia-shelby-frontend/src/services/api.ts` — instância `axios` já configurada com `baseURL` via `NEXT_PUBLIC_API_URL` — usar diretamente, sem criar novo client HTTP.

## 7) Documentação externa (via Context7)

### Consultas realizadas

| Library ID | Query | Resumo do resultado |
|------------|-------|---------------------|
| `/nodemailer/nodemailer-homepage` | "createTransport SMTP host port secure auth user pass sendMail example TypeScript" | Confirma API `nodemailer.createTransport({ host, port, secure, auth: { user, pass } })` e `transporter.sendMail({ from, to, subject, text, html })`; também documenta `service: "Gmail"` como preset alternativo (não necessário aqui, já que o epic pede `SMTP_HOST`/`SMTP_PORT` explícitos). |
| `/nodemailer/nodemailer-homepage` | "Ethereal test account createTestAccount getTestMessageUrl for development fallback" | Confirma `nodemailer.createTestAccount()` (gera `user`/`pass`/`smtp.host`/`smtp.port`/`smtp.secure` temporários) e `nodemailer.getTestMessageUrl(info)` para obter a URL de preview de cada email enviado — exatamente o mecanismo de fallback sem credencial real pedido pelo epic. |

### Trechos relevantes
- **Nodemailer — transporte SMTP real**:
  ```javascript
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465, // true para 465, false para 587/outras
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  ```
- **Nodemailer — fallback Ethereal (sem `SMTP_HOST`)**:
  ```javascript
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  // Após sendMail: nodemailer.getTestMessageUrl(info) -> URL de preview
  ```

## 8) Impactos prováveis (áreas afetadas)
- **Backend — rotas/controllers**: `auth.routes.ts`, `auth.controller.ts`, `appointment.controller.ts`, `clientController.ts`.
- **Backend — domínio**: `auth.service.ts` (novos métodos), `notifications/email.service.ts` (implementação completa, hoje vazio).
- **Backend — validação**: novo arquivo de schemas Zod para os 3 endpoints de reset (local exato a decidir na fase de planejamento — provavelmente `src/schemas/auth.schemas.ts`, hoje inexistente).
- **Backend — config**: `.env` (adicionar `SMTP_*`), `.env.example` (novo arquivo, não existe hoje).
- **Backend — docs**: `barbearia-backend/CLAUDE.md` (seção "Variáveis de Ambiente", trocar `EMAIL_USER`/`EMAIL_PASS` por `SMTP_*`; seção "Rotas", documentar os 3 endpoints novos).
- **Frontend — páginas/componentes**: `EsqueciSenha/page.tsx`, `EsqueciSenha/EmailRecuperacao.tsx` (sem mudança estrutural), `EsqueciSenha/OtpVerification.tsx` (prop nova + handler de reenvio), `EsqueciSenha/NovaSenha.tsx` (sem mudança estrutural).
- **Contrato de API (novo)**: 3 rotas novas e públicas em `/api/auth/*` — não quebra nenhum contrato existente (endpoints aditivos). Sinalizar ao usuário por serem rotas novas consumidas pelo frontend (mudança de contrato cross-repo, conforme regra do `CLAUDE.md` raiz).

## 9) Critérios de aceitação
- [ ] Usuário consegue solicitar recuperação de senha informando o email cadastrado, recebe um código de 6 dígitos por email (real via SMTP configurado, ou visível via preview Ethereal em ambiente sem credencial real).
- [ ] Código expira em 10 minutos; código expirado/errado é rejeitado com mensagem clara, sem quebrar a tela.
- [ ] "Reenviar" na tela de código funciona de verdade (hoje é um link morto) e gera um novo código válido, invalidando o anterior.
- [ ] Usuário consegue definir uma nova senha após verificar o código, e consegue logar com a nova senha em seguida.
- [ ] Solicitar reset para um email que não existe no sistema não revela essa informação (resposta genérica, mesmo comportamento visual do fluxo de sucesso).
- [ ] Um código já usado (senha já trocada) não pode ser reusado para trocar a senha de novo.
- [ ] Criar um agendamento (cliente logado ou convidado, com email informado) dispara um email de confirmação, sem atrasar nem quebrar a resposta do agendamento caso o envio falhe.
- [ ] Cadastrar uma nova conta de cliente (`/CriarConta`) dispara um email de boas-vindas, sem atrasar nem quebrar o cadastro caso o envio falhe.
- [ ] `.env.example` existe no backend, só com nomes de variável (incluindo as `SMTP_*` novas), sem nenhum valor real.
- [ ] Nenhuma credencial SMTP real é commitada em nenhum arquivo versionado.
- [ ] Regra transversal do roadmap preservada: visitante e cliente continuam acessando exatamente `/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`, `/meus-servicos` sem mudança de layout/comportamento fora do que este epic pede.

## 10) Open Questions (bloqueios / dúvidas)
Nenhuma. Todos os pontos que poderiam ser dúvida foram resolvidos com evidência do codebase:
- **Token de reset (link) vs. OTP numérico**: resolvido a favor de **manter OTP numérico** — `OtpVerification.tsx` já é uma tela funcional de 6 inputs de 1 dígito (não 3, como uma nota do roadmap presumia; o código real usa `Array(6).fill("")`), e o model `Otp` já existe no schema com exatamente os campos necessários (`email`, `code`, `expiresAt`). Manter OTP evita qualquer mudança de UX/fluxo de telas, só troca o mock por chamadas reais.
- **Onde persistir o estado de reset**: resolvido a favor de **reusar o model `Otp` existente sem alteração de schema**, consumindo por `delete` no sucesso do reset (em vez de adicionar coluna `used`/`consumedAt`) — mais simples, sem migration nova, suficiente para o caso de uso (código de uso único, expiração curta).
- **Outros touchpoints de email a criar**: resolvido a favor de **confirmação de agendamento** e **boas-vindas no cadastro de cliente** — ambos os pontos já têm o dado de email disponível no fluxo atual (`appointment.client?.email`/`appointment.guestEmail`, `ClientService.register`), baixo risco (fire-and-forget, não bloqueia o fluxo principal se o SMTP falhar), e citados como exemplo no próprio texto do epic. **Boas-vindas no cadastro de staff** (`AuthService.register`) foi deliberadamente deixado de fora — fluxo interno/administrativo, não de autoatendimento, menor prioridade dentro do orçamento deste epic.
