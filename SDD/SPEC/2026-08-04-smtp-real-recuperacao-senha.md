# Spec — Envio de email real via SMTP configurável por variáveis de ambiente, fechando o fluxo de recuperação de senha e cobrindo outros pontos de notificação por email identificados na pesquisa

## Objective
- Implementar `EmailService` real (SMTP via `nodemailer`, com fallback automático para Ethereal quando `SMTP_HOST` não está configurado).
- Fechar o fluxo de recuperação de senha ponta a ponta: 3 rotas novas em `/api/auth`, reusando o model `Otp` já existente no schema, e o frontend de `EsqueciSenha` chamando a API real.
- Disparar email de confirmação de agendamento e de boas-vindas no cadastro de cliente, de forma não bloqueante.

## Scope
**In**
- `src/notifications/email.service.ts`, `src/services/auth.service.ts`, `src/controllers/auth.controller.ts`, `src/routes/auth.routes.ts`, `src/schemas/auth.schemas.ts` (novo), `src/controllers/appointment.controller.ts`, `src/controllers/clientController.ts`, `.env`, `.env.example` (novo), `barbearia-backend/CLAUDE.md`.
- `EsqueciSenha/page.tsx`, `EsqueciSenha/OtpVerification.tsx`, `EsqueciSenha/NovaSenha.tsx`.

**Out**
- Qualquer migration Prisma nova (o model `Otp` já existe e já está migrado).
- `src/routes/index.ts`, `client.routes.ts` (nenhuma rota nova ali).
- Rate limiting dedicado, WhatsApp, auditoria/filas (Epic 11), remoção da dependência `resend`.

## Files to Modify

### `barbearia-backend/src/notifications/email.service.ts`
- Changes:
  - Implementar classe `EmailService` com transporte lazy (singleton): se `process.env.SMTP_HOST` definido, usa `nodemailer.createTransport({ host, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })`. Senão, usa `nodemailer.createTestAccount()` + `createTransport` com os dados da conta de teste (Ethereal), logando no console (`console.log`) que está em modo fallback e as credenciais geradas.
  - Método privado `getTransporter()` — cria o transporte na primeira chamada e cacheia (module-level ou propriedade estática), reaproveitando entre chamadas (evita recriar conta Ethereal a cada email).
  - `async sendPasswordResetOtp(to: string, code: string): Promise<void>` — assunto "Código de recuperação de senha — Barbearia Shelby", corpo texto+HTML simples com o código em destaque e aviso de expiração em 10 minutos. `from`: `process.env.SMTP_FROM || '"Barbearia Shelby" <no-reply@barbearia-shelby.local>'`. Após `sendMail`, se o transporte for o fallback Ethereal, logar `nodemailer.getTestMessageUrl(info)` no console.
  - `async sendAppointmentConfirmation(to: string, data: { clientName: string; serviceName: string; date: Date; barberName?: string }): Promise<void>` — assunto "Agendamento confirmado — Barbearia Shelby", corpo com nome do serviço, data/hora formatada (usar `date-fns`/`date-fns-tz`, já dependências do projeto, para formatar em `America/Sao_Paulo`) e nome do barbeiro se houver. Mesmo log de preview URL em fallback.
  - `async sendWelcomeEmail(to: string, name: string): Promise<void>` — assunto "Bem-vindo à Barbearia Shelby", corpo simples de boas-vindas. Mesmo log de preview URL em fallback.
  - Todos os métodos devem deixar o erro subir (`throw`) para quem chamar decidir se trata como bloqueante ou não — no caso deste epic, todos os call sites tratam como não bloqueante (`.catch` no controller), exceto `sendPasswordResetOtp`, cuja falha deve sim propagar como erro 500 para `forgot-password` (se o email não puder ser enviado, o usuário precisa saber que o fluxo falhou, não deve ficar esperando um código que nunca chega).
- Notes/Constraints:
  - Não criar arquivo de config novo; toda leitura de env direto em `email.service.ts` via `process.env`.
  - Import `nodemailer` como `import nodemailer from 'nodemailer'` (default export, mesmo padrão de outras libs no projeto, ex. `import bcrypt from 'bcryptjs'`).
- Reuse:
  - `date-fns`/`date-fns-tz` já usados em `appointmentService.ts` para timezone BRT — mesmo padrão de import.

### `barbearia-backend/src/services/auth.service.ts`
- Changes:
  - Adicionar 3 métodos novos à classe `AuthService`, seguindo o padrão de try/catch + `console.error` já usado em `register`/`login`:
    - `async forgotPassword(email: string): Promise<void>`:
      1. Busca `prisma.user.findUnique({ where: { email } })`. Se não existir, **retorna silenciosamente** (sem lançar erro) — não revela ao chamador se o email existe.
      2. Se existir: `prisma.otp.deleteMany({ where: { email } })` (invalida códigos anteriores), gera código de 6 dígitos (`String(Math.floor(100000 + Math.random() * 900000))`), `prisma.otp.create({ data: { email, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } })`, depois `await new EmailService().sendPasswordResetOtp(email, code)`. Se o envio de email falhar, deixar o erro propagar (o controller decide o status HTTP).
    - `async verifyResetOtp(email: string, code: string): Promise<void>`:
      1. Busca `prisma.otp.findFirst({ where: { email, code }, orderBy: { createdAt: 'desc' } })`.
      2. Se não existir ou `expiresAt < new Date()`: `throw new CustomError('Código inválido ou expirado.', 400)`.
      3. Se válido: retorna (não apaga o registro — apagar é responsabilidade de `resetPassword`, para permitir reentrada na tela de nova senha sem invalidar o código já confirmado).
    - `async resetPassword(email: string, code: string, newPassword: string): Promise<void>`:
      1. Repete a mesma validação de `verifyResetOtp` (busca + expiração) — não early-return de sucesso anterior, pois é uma chamada HTTP separada.
      2. Se válido: `bcrypt.hash(newPassword, 10)`, `prisma.user.update({ where: { email }, data: { password: hashed } })`, depois `prisma.otp.deleteMany({ where: { email } })` (consome/invalida).
      3. Se inválido: `throw new CustomError('Código inválido ou expirado.', 400)`.
  - Import novo: `import { EmailService } from '../notifications/email.service';` e `import { CustomError } from '../utils/customErrors';` (checar se `CustomError` já está importado no arquivo — hoje não está, `auth.service.ts` usa `throw new Error(...)` simples; adicionar o import).
- Notes/Constraints:
  - Código OTP de 6 dígitos numéricos, sempre como string (compatível com o campo `code String` do schema e com os 6 inputs de `OtpVerification.tsx`).
  - `forgotPassword` nunca deve lançar erro por "email não encontrado" — isso é o que garante a resposta genérica anti-enumeração no controller.
- Reuse:
  - `bcrypt`/`prisma` já importados no topo do arquivo — reusar as mesmas instâncias/imports existentes.

### `barbearia-backend/src/controllers/auth.controller.ts`
- Changes:
  - Adicionar 3 métodos à classe `AuthController`, seguindo o padrão try/catch dos métodos existentes:
    - `async forgotPassword(req, res)`: extrai `email` do body (já validado por `validate(forgotPasswordSchema)` na rota); chama `this.authService.forgotPassword(email)`; retorna sempre `200 { message: 'Se o email existir em nossa base, um código de verificação foi enviado.' }`, **mesmo em caso de erro interno no envio** — na prática, como `forgotPassword` só lança erro se o `sendMail` falhar (email existe, mas SMTP indisponível), esse caso deve retornar `502 { error: 'Não foi possível enviar o email agora. Tente novamente em instantes.' }` (distinção necessária para o usuário não ficar esperando um código que nunca chegará por falha de infraestrutura, sem revelar se o email existe ou não — a mensagem de erro é sobre o envio, não sobre a existência da conta).
    - `async verifyResetOtp(req, res)`: extrai `email`, `code` do body; chama `this.authService.verifyResetOtp(email, code)`; retorna `200 { valid: true }`; em caso de `CustomError`, retorna `err.statusCode` com `{ error: err.message }`.
    - `async resetPassword(req, res)`: extrai `email`, `code`, `newPassword` do body; chama `this.authService.resetPassword(email, code, newPassword)`; retorna `200 { message: 'Senha alterada com sucesso.' }`; mesmo tratamento de `CustomError`.
- Notes/Constraints:
  - Seguir o padrão de bind usado em `auth.routes.ts` (`authController.metodo.bind(authController)`).

### `barbearia-backend/src/routes/auth.routes.ts`
- Changes:
  - Importar `forgotPasswordSchema`, `verifyResetOtpSchema`, `resetPasswordSchema` de `../schemas/auth.schemas`.
  - Adicionar, sem `authMiddleware` (rotas públicas, mesmo padrão de `/login`):
    ```
    authRouter.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword.bind(authController));
    authRouter.post('/verify-reset-otp', validate(verifyResetOtpSchema), authController.verifyResetOtp.bind(authController));
    authRouter.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword.bind(authController));
    ```
- Notes/Constraints:
  - Manter as rotas existentes (`/register`, `/login`) intactas.

### `barbearia-backend/src/controllers/appointment.controller.ts`
- Changes:
  - No método `create`, depois de `const newAppointment = await appointmentService.createAppointment(...)` e antes do `return res.status(201).json(newAppointment)`: disparar o email de confirmação sem `await` bloquear a resposta —
    ```ts
    const recipientEmail = newAppointment.client?.email ?? newAppointment.guestEmail;
    const recipientName = newAppointment.client?.name ?? newAppointment.guestName ?? 'Cliente';
    if (recipientEmail) {
      new EmailService().sendAppointmentConfirmation(recipientEmail, {
        clientName: recipientName,
        serviceName: newAppointment.service?.name,
        date: newAppointment.date,
        barberName: newAppointment.admin?.name,
      }).catch((err) => console.error('Falha ao enviar email de confirmação de agendamento:', err));
    }
    ```
  - Import novo: `import { EmailService } from '../notifications/email.service';`.
- Notes/Constraints:
  - Não usar `await` nessa chamada — a resposta HTTP 201 não deve esperar o envio do email (requisito de não bloquear o fluxo principal).
  - `newAppointment` já vem com `client`/`service`/`admin` via `include` em `AppointmentService.createAppointment` (confirmado em `appointmentService.ts:296-307`) — nenhuma query adicional necessária.

### `barbearia-backend/src/controllers/clientController.ts`
- Changes:
  - No método `register`, depois de `const client = await this.clientService.register(...)` e antes do `return res.status(201).json(client)`:
    ```ts
    if (client.email) {
      new EmailService().sendWelcomeEmail(client.email, client.name).catch((err) => console.error('Falha ao enviar email de boas-vindas:', err));
    }
    ```
  - Import novo: `import { EmailService } from '../notifications/email.service';`.
- Notes/Constraints:
  - Mesmo padrão fire-and-forget do appointment — não usar `await` bloqueando a resposta 201.

### `barbearia-backend/.env`
- Changes:
  - Substituir o bloco `EMAIL_USER`/`EMAIL_PASS` (placeholders não usados por código nenhum) por:
    ```
    SMTP_HOST=
    SMTP_PORT=
    SMTP_USER=
    SMTP_PASS=
    SMTP_FROM=
    ```
  - Deixar todos os valores em branco no ambiente local (sem credencial SMTP real disponível) — isso aciona o fallback Ethereal automaticamente para dev/E2E.
- Notes/Constraints:
  - Arquivo já está no `.gitignore` (`.env`), não será commitado — seguro editar localmente com placeholders vazios.

### `barbearia-backend/CLAUDE.md`
- Changes:
  - Seção "Variáveis de Ambiente (`.env`)": trocar `EMAIL_USER=`/`EMAIL_PASS=` por `SMTP_HOST=`/`SMTP_PORT=`/`SMTP_USER=`/`SMTP_PASS=`/`SMTP_FROM=`.
  - Seção "Rotas (API)": sob `auth.routes.ts — login/registro`, adicionar linha citando as 3 rotas novas (`forgot-password`, `verify-reset-otp`, `reset-password`).
- Notes/Constraints:
  - Não alterar mais nada nesse arquivo (fora do escopo deste epic).

## Files to Create

### `barbearia-backend/.env.example`
- Purpose:
  - Documentar as variáveis de ambiente esperadas, sem nenhum valor real, para onboarding e para satisfazer o guardrail do epic ("`.env.example` deve ter só os nomes das variáveis, sem valor").
- Contents:
  ```
  DATABASE_URL=
  JWT_SECRET=

  SMTP_HOST=
  SMTP_PORT=
  SMTP_USER=
  SMTP_PASS=
  SMTP_FROM=

  WHATSAPP_TOKEN=
  WHATSAPP_PHONE_ID=
  WHATSAPP_BUSINESS_ID=
  ```
- Integration points:
  - Nenhum (arquivo de documentação, não é importado por código).

### `barbearia-backend/src/schemas/auth.schemas.ts`
- Purpose:
  - Validação Zod dos 3 endpoints novos, seguindo o padrão de `src/schemas/admin.schemas.ts` (`z.object({ body: z.object({...}) })`, consumido por `validate.middleware.ts`).
- Contents:
  ```ts
  import { z } from 'zod';

  export const forgotPasswordSchema = z.object({
    body: z.object({
      email: z.string().email('Email inválido.'),
    }),
  });

  export const verifyResetOtpSchema = z.object({
    body: z.object({
      email: z.string().email('Email inválido.'),
      code: z.string().length(6, 'O código deve ter 6 dígitos.'),
    }),
  });

  export const resetPasswordSchema = z.object({
    body: z.object({
      email: z.string().email('Email inválido.'),
      code: z.string().length(6, 'O código deve ter 6 dígitos.'),
      newPassword: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
    }),
  });
  ```
- Integration points:
  - Importado por `src/routes/auth.routes.ts`.

## Files to Modify (frontend)

### `barbearia-shelby-frontend/src/app/EsqueciSenha/page.tsx`
- Changes:
  - Importar `api` de `@/services/api`.
  - Adicionar states `loading` (boolean) e `error` (string) no componente de página.
  - `handleEmailNext` vira `async`: `setLoading(true)`, `await api.post('/auth/forgot-password', { email: emailDigitado })`, em caso de sucesso `setEmail(emailDigitado); setStep('codigo')`; em caso de erro (raro — só falha de infraestrutura, ver Spec do controller), mostrar erro genérico e não avançar de step. Sempre `setLoading(false)` no fim (`finally`).
  - `handleCodigoVerificado` vira `async`: recebe `codigoDigitado`, `await api.post('/auth/verify-reset-otp', { email, code: codigoDigitado })`; sucesso → `setCodigo(codigoDigitado); setStep('senha')`; erro (400, código inválido/expirado) → `setError('Código inválido ou expirado. Tente novamente ou reenvie o código.')`, mantém no step `codigo` (repassar esse erro para `OtpVerification` via prop `apiError`).
  - Novo handler `handleResendCode`: `await api.post('/auth/forgot-password', { email })` (reaproveita o mesmo endpoint), sem trocar de step, feedback simples (ex. mensagem "Código reenviado").
  - `handleNovaSenha` vira `async`: `await api.post('/auth/reset-password', { email, code: codigo, newPassword: senha })`; sucesso → mensagem de sucesso inline (mesmo padrão de `CriarConta/page.tsx`: `setSuccessMessage(...)` + `setTimeout(() => router.push('/Login'), 1500)`), removendo o `alert()` atual; erro → `setError(...)`, repassado a `NovaSenha` via prop `apiError`.
  - Passar `email` como prop nova para `<OtpVerification email={email} onVerify={handleCodigoVerificado} onResend={handleResendCode} apiError={step === 'codigo' ? error : undefined} />`.
  - Passar `apiError` para `<NovaSenha ... apiError={step === 'senha' ? error : undefined} />`.
- Notes/Constraints:
  - Limpar `error` (`setError('')`) ao trocar de step com sucesso, para não vazar mensagem de um step anterior.
  - Precisa de `useRouter` (`next/navigation`) — importar, mesmo padrão de `Login/page.tsx`/`CriarConta/page.tsx`.
- Reuse:
  - Mesmo padrão de mensagem de sucesso fixa (`position: fixed`, cores verdes) já usado em `CriarConta/page.tsx:36-40` — replicar inline ou extrair, decisão mínima: replicar inline (evita tocar em componente compartilhado fora do escopo).

### `barbearia-shelby-frontend/src/components/EsqueciSenha/OtpVerification.tsx`
- Changes:
  - Interface `OtpProps` ganha `email: string`, `onResend: () => void`, `apiError?: string`.
  - `handleSubmit` permanece chamando `onVerify(otp.join(""))` (comportamento não muda — a chamada de API acontece na página, não no componente, mesmo padrão dos outros componentes de `EsqueciSenha`).
  - Trocar `<a href="">Reenviar</a>` (linha 54) por `<button type="button" onClick={onResend}>Reenviar</button>` estilizado como link (reusar classe existente do CSS module se houver botão-como-link em outro lugar do projeto; senão, `<a href="#" onClick={(e) => { e.preventDefault(); onResend(); }}>Reenviar</a>` para manter o visual atual sem CSS novo).
  - Exibir `apiError` acima do form (`{apiError && <p className={styles.error}>{apiError}</p>}`), reusando a classe `.error` já definida em `EsqueciSenha.module.css` (confirmada em uso por `NovaSenha.tsx:36`).
- Notes/Constraints:
  - Não alterar o número de dígitos (6) nem o layout dos inputs — só troca o mock por integração real.
  - Prop `email` não precisa ser exibida na UI, só está disponível caso vire necessária no futuro (ex. mensagem "Enviamos um código para {email}") — decisão de escopo: **incluir a exibição do email** na `infoText` já existente (linha 36), trocando `"Digite o código de 6 dígitos enviado para seu email."` por `` `Digite o código de 6 dígitos enviado para ${email}.` `` — melhora de UX trivial e sem custo adicional, mantém a mesma estrutura de texto.

### `barbearia-shelby-frontend/src/components/EsqueciSenha/NovaSenha.tsx`
- Changes:
  - Interface `NovaSenhaProps` ganha `apiError?: string`.
  - No JSX, trocar `{error && <p className={styles.error}>{error}</p>}` por `{(apiError || error) && <p className={styles.error}>{apiError || error}</p>}` — mesmo padrão de precedência de `CriarConta.tsx:69`.
- Notes/Constraints:
  - `onSubmit` continua com a mesma assinatura (`(email: string, senha: string) => void`) — o `code` necessário para `POST /reset-password` já está disponível no state da página (`codigo`), não precisa passar pelo componente.

## Implementation Order (recommended)
1. `src/notifications/email.service.ts` (base de tudo — nada mais funciona sem isso).
2. `src/schemas/auth.schemas.ts`.
3. `src/services/auth.service.ts` (3 métodos novos).
4. `src/controllers/auth.controller.ts` (3 métodos novos).
5. `src/routes/auth.routes.ts` (3 rotas novas).
6. `.env` + `.env.example` + `barbearia-backend/CLAUDE.md`.
7. `src/controllers/appointment.controller.ts` (confirmação de agendamento).
8. `src/controllers/clientController.ts` (boas-vindas).
9. Frontend: `OtpVerification.tsx`, `NovaSenha.tsx`, depois `EsqueciSenha/page.tsx` (página por último, pois é quem orquestra as props novas dos dois componentes).

## Validation (commands / checks)
- Backend: `npm run build` (dentro de `barbearia-backend/`) — `tsc`, precisa compilar sem erro.
- Frontend: `npm run build` (dentro de `barbearia-shelby-frontend/`) — `next build`, precisa gerar todas as rotas sem erro. Lint: `npx eslint src/app/EsqueciSenha src/components/EsqueciSenha` (mesmo desvio de tooling documentado no Epic 9 — `npm run lint` está quebrado no `package.json` do Next 16.1.1).
- Manual/E2E: fluxo completo via browser — solicitar reset, capturar código (via log/preview Ethereal, já que não há credencial SMTP real), verificar código, definir nova senha, logar com a nova senha.

## Notes
- Nenhuma migration Prisma nova é necessária (model `Otp` já existe e já está aplicado no banco via `20260512222028_add_otp_table`).
- Contrato de API muda (rotas novas em `/api/auth/*`, aditivas, sem quebra de contrato existente) — sinalizar ao usuário, conforme regra do `CLAUDE.md` raiz.
- Sem credencial SMTP real disponível neste ambiente — fallback Ethereal cobre a validação E2E; produção fica pendente de credencial real (documentar como pendência).
