# Spec — Página de configurações do admin com parâmetros de auditoria e de filas/jobs do sistema

## Objective
- Tabelas `AuditLog`/`AuditSettings`/`JobConfig` (aditivas), captura de auditoria nas 4 rotas
  administrativas já existentes, camada de jobs agendados sobre `node-cron`, API
  `/api/admin-settings/*` (só `ADMIN`), e página `/barber/configuracoes/sistema` (só `admin`).

## Scope
**In**
- Backend: schema, migration, `auditService`, `jobConfigService`, `schedulerManager`,
  `appointmentReminder` reescrito, `auditLogCleanup` novo, `EmailService.sendAppointmentReminder`,
  wiring de auditoria em `userService`/`businessHoursService`/`holidayService`/`planService` e seus
  controllers, rotas/controller novos `adminSettings`.
- Frontend: hook `useSystemSettings`, página+layout `barber/configuracoes/sistema`, link
  condicional em `barber/configuracoes/page.tsx`.

**Out**
- Redis/BullMQ, viewer de log avançado, novos jobs, WhatsApp, testes automatizados novos,
  aplicação real da migration (documentada, não executada nesta sessão).

## Files to Modify

### `barbearia-backend/prisma/schema.prisma`
- Changes:
  - Adicionar ao final do arquivo (após `ClientSubscription`):
    ```prisma
    model AuditLog {
      id        Int      @id @default(autoincrement())
      actorId   Int
      actorName String
      actorRole String
      action    String
      entity    String
      entityId  String?
      metadata  String?
      createdAt DateTime @default(now())

      @@index([createdAt])
      @@index([entity])
    }

    model AuditSettings {
      id             Int      @id @default(autoincrement())
      retentionDays  Int      @default(90)
      enabledModules String   @default("USERS,BUSINESS_HOURS,HOLIDAYS,PLANS")
      updatedAt      DateTime @updatedAt
    }

    model JobConfig {
      id             Int       @id @default(autoincrement())
      jobKey         String    @unique
      enabled        Boolean   @default(false)
      cronExpression String
      lastRunAt      DateTime?
      updatedAt      DateTime  @updatedAt
    }
    ```
- Notes/Constraints:
  - `AuditLog.actorId` **não** é uma relação Prisma (sem `@relation`) — é um snapshot (junto com
    `actorName`/`actorRole`), de propósito: sobrevive à eventual exclusão do usuário ator, e evita
    modificar o model `User` (fora de escopo).
  - `metadata` é `String?` (JSON serializado via `JSON.stringify`, não o tipo `Json` do Prisma) —
    decisão para manter compatível com acesso via `$queryRaw`/`$executeRaw` sem exigir cast
    `::jsonb` em SQL escrito à mão.
  - `enabledModules` é `String` (CSV, ex. `"USERS,HOLIDAYS"`), não `String[]` — mesma razão
    (simplicidade em raw SQL sem testar contra Postgres real nesta sessão).
- Reuse: nenhuma nova geração de client tipado é necessária para o código funcionar (ver Notas em
  `auditService.ts`/`jobConfigService.ts`).

### `barbearia-backend/src/notifications/email.service.ts`
- Changes: adicionar método novo à classe `EmailService`, após `sendAppointmentConfirmation`:
  ```ts
  // Email de lembrete de agendamento — disparado pelo job appointmentReminder (JobConfig).
  async sendAppointmentReminder(to: string, data: AppointmentConfirmationData): Promise<void> {
      const subject = 'Lembrete: seu agendamento é amanhã — Barbearia Shelby';
      const dateFormatted = formatDateBR(data.date);
      const barberLine = data.barberName ? `Profissional: ${data.barberName}\n` : '';
      const barberHtmlLine = data.barberName ? `<p><strong>Profissional:</strong> ${data.barberName}</p>` : '';
      const text =
          `Olá, ${data.clientName}!\n\n` +
          `Passando para lembrar do seu agendamento amanhã na Barbearia Shelby:\n\n` +
          `Serviço: ${data.serviceName}\n` +
          `Data/Hora: ${dateFormatted}\n` +
          barberLine +
          `\nAté breve!`;
      const html = `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
              <h2 style="color: #f67366;">Lembrete de agendamento</h2>
              <p>Olá, <strong>${data.clientName}</strong>!</p>
              <p>Passando para lembrar do seu agendamento <strong>amanhã</strong> na Barbearia Shelby:</p>
              <p><strong>Serviço:</strong> ${data.serviceName}</p>
              <p><strong>Data/Hora:</strong> ${dateFormatted}</p>
              ${barberHtmlLine}
              <p>Até breve!</p>
          </div>
      `;
      await this.send(to, subject, text, html);
  }
  ```
- Notes/Constraints: reusa `AppointmentConfirmationData` (já exportado), `formatDateBR`, `this.send`
  — nenhuma mudança em código existente do arquivo.
- Reuse: mesmo padrão de `sendAppointmentConfirmation` (linha ~107 do arquivo atual).

### `barbearia-backend/src/schedulers/appointmentReminder.ts`
- Changes: substituir o conteúdo inteiro (hoje 100% comentado) por:
  ```ts
  import { prisma } from '../services/prisma.service';
  import { EmailService } from '../notifications/email.service';

  const emailService = new EmailService();

  // Chamado pelo schedulerManager conforme o JobConfig (jobKey = 'appointmentReminder').
  // Não se auto-registra mais via cron.schedule — quem decide quando rodar é o schedulerManager.
  export async function runAppointmentReminderJob(): Promise<void> {
      console.log('⏰ [appointmentReminder] Verificando agendamentos para amanhã...');

      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const start = new Date(tomorrow.setHours(0, 0, 0, 0));
      const end = new Date(tomorrow.setHours(23, 59, 59, 999));

      const appointments = await prisma.appointment.findMany({
          where: { date: { gte: start, lte: end }, status: 'CONFIRMED' },
          include: { client: true, service: true, admin: true },
      });

      if (appointments.length === 0) {
          console.log('📭 [appointmentReminder] Nenhum agendamento confirmado para amanhã.');
          return;
      }

      let sent = 0;
      for (const appointment of appointments) {
          const email = appointment.guestEmail || appointment.client?.email;
          if (!email) continue;
          const name = appointment.guestName || appointment.client?.name || 'cliente';
          try {
              await emailService.sendAppointmentReminder(email, {
                  clientName: name,
                  serviceName: appointment.service.name,
                  date: appointment.date,
                  barberName: appointment.admin?.name,
              });
              sent++;
          } catch (err) {
              console.error(`[appointmentReminder] Falha ao enviar lembrete para ${email}:`, err);
          }
      }
      console.log(`✅ [appointmentReminder] ${sent}/${appointments.length} lembrete(s) enviado(s).`);
  }
  ```
- Notes/Constraints: `sendWhatsappMessage`/WhatsApp não são mais referenciados aqui (canal trocado
  para email, decisão do PRD §2). `whatsappService.ts` permanece intocado/comentado.
- Reuse: `prisma.service.ts`, `EmailService`.

### `barbearia-backend/src/server.ts`
- Changes:
  ```ts
  import "dotenv/config";
  import app from "./app";
  import { bootstrap as bootstrapSchedulers } from "./schedulers/schedulerManager";

  const PORT = Number(process.env.PORT) || 3001;
  const HOST = process.env.HOST || "0.0.0.0";

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Server is running on ${HOST}:${PORT}`);
  });

  bootstrapSchedulers().catch((err) => {
    console.error('[Scheduler] Falha ao inicializar jobs agendados:', err);
  });
  ```
- Notes/Constraints: `bootstrap()` é fire-and-forget (não bloqueia o `app.listen`); erros (ex.:
  tabela `JobConfig` ainda não migrada em algum ambiente) só logam, não derrubam o processo.

### `barbearia-backend/src/services/userService.ts`
- Changes:
  - Importar `AuditService` (`import { AuditService } from './auditService';`) e instanciar
    `private auditService = new AuditService();` dentro da classe.
  - Assinatura de `create`: `async create(actor: { id: number; role: string }, data: CreateUserData)`.
    Após o `prisma.user.create(...)` bem-sucedido, antes do `return`:
    ```ts
    await this.auditService.log(actor, 'USERS', 'USER_CREATE', 'User', String(user.id), { role: user.role });
    ```
    (guardar o resultado do create numa variável `user` antes de retornar, se ainda não estiver).
  - Assinatura de `update`: já recebe `actorId: number` — trocar para
    `async update(actor: { id: number; role: string }, targetId: number, data: UpdateUserData)`, e
    usar `actor.id` no lugar de `actorId` internamente (bloqueio de auto-edição). Após o
    `prisma.user.update(...)` bem-sucedido:
    ```ts
    await this.auditService.log(actor, 'USERS', 'USER_UPDATE', 'User', String(targetId), { fields: Object.keys(updateData) });
    ```
- Notes/Constraints: `MANAGEABLE_ROLES`/validações existentes não mudam. `auditService.log` nunca
  lança (try/catch interno) — não precisa de tratamento de erro adicional aqui.
- Reuse: `AuditService.log`.

### `barbearia-backend/src/controllers/user.controller.ts`
- Changes:
  - `create`: adicionar guarda de autenticação (mesmo padrão de `update`) e passar o ator:
    ```ts
    create = async (req: Request, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Não autenticado.' });
            }
            const { name, email, phone, password, role } = req.body;
            const user = await this.service.create({ id: req.user.id, role: req.user.role }, { name, email, phone, password, role });
            return res.status(201).json(user);
        } catch (err: any) {
            ...(inalterado)
        }
    };
    ```
  - `update`: trocar `this.service.update(req.user.id, id, req.body)` por
    `this.service.update({ id: req.user.id, role: req.user.role }, id, req.body)`.
- Notes/Constraints: resposta/erros inalterados; só a chamada ao service muda.

### `barbearia-backend/src/services/businessHoursService.ts`
- Changes:
  - Importar/instanciar `AuditService` como acima.
  - Assinatura de `updateBulk`: `async updateBulk(actor: { id: number; role: string }, entries: BusinessHoursEntry[])`.
    Após o `prisma.$transaction(...)` bem-sucedido, antes do `return this.listAll()`:
    ```ts
    await this.auditService.log(actor, 'BUSINESS_HOURS', 'BUSINESS_HOURS_UPDATE', 'BusinessHours', null, { days: entries.length });
    ```
- Notes/Constraints: validações existentes (7 entradas, formato HH:mm, etc.) inalteradas.

### `barbearia-backend/src/controllers/businessHours.controller.ts`
- Changes: `updateBulk` passa a checar `req.user` (401 se ausente) e chamar
  `this.service.updateBulk({ id: req.user.id, role: req.user.role }, req.body)`.
- Notes/Constraints: rota já é `authMiddleware`-protegida, então `req.user` estará presente em
  runtime; a guarda é só para satisfazer o tipo opcional (`req.user?`) e por consistência com
  `user.controller.ts`.

### `barbearia-backend/src/services/holidayService.ts`
- Changes:
  - Importar/instanciar `AuditService`.
  - `create(actor: { id: number; role: string }, data: { date: string; reason?: string })` — após
    `prisma.holiday.create(...)`:
    ```ts
    await this.auditService.log(actor, 'HOLIDAYS', 'HOLIDAY_CREATE', 'Holiday', String(holiday.id), { date: data.date });
    ```
  - `delete(actor: { id: number; role: string }, id: number)` — após `prisma.holiday.delete(...)`:
    ```ts
    await this.auditService.log(actor, 'HOLIDAYS', 'HOLIDAY_DELETE', 'Holiday', String(id));
    ```
- Notes/Constraints: tratamento de erro `P2002`/`P2025` existente inalterado.

### `barbearia-backend/src/controllers/holiday.controller.ts`
- Changes: `create` e `delete` checam `req.user` (401 se ausente) e passam
  `{ id: req.user.id, role: req.user.role }` como primeiro argumento aos métodos do service.

### `barbearia-backend/src/services/planService.ts`
- Changes:
  - Importar/instanciar `AuditService`.
  - `create(actor: { id: number; role: string }, data: CreatePlanData)` — após
    `prisma.plan.create(...)`:
    ```ts
    await this.auditService.log(actor, 'PLANS', 'PLAN_CREATE', 'Plan', String(plan.id), { name: data.name });
    ```
  - `update(actor: { id: number; role: string }, id: number, data: UpdatePlanData)` — após
    `prisma.plan.update(...)`:
    ```ts
    await this.auditService.log(actor, 'PLANS', 'PLAN_UPDATE', 'Plan', String(id), { fields: Object.keys(updateData) });
    ```
- Notes/Constraints: `validateCutsAndPrice` inalterada.

### `barbearia-backend/src/controllers/plan.controller.ts`
- Changes: `create` e `update` checam `req.user` (401 se ausente) e passam o ator como primeiro
  argumento.

### `barbearia-backend/src/routes/index.ts`
- Changes:
  ```ts
  import adminSettingsRoutes from './adminSettings.routes';
  // ...
  router.use('/admin-settings', adminSettingsRoutes);
  ```
- Notes/Constraints: adicionar junto aos outros `router.use(...)`, ordem não é sensível (path
  próprio, sem conflito de prefixo com rotas existentes).

### `barbearia-shelby-frontend/src/app/barber/configuracoes/page.tsx`
- Changes:
  - Adicionar imports: `import Link from 'next/link';` e `import { useAuth } from '@/context/AuthContext';`.
  - Dentro do componente, `const auth = useAuth();`.
  - Após a seção "Feriados / Bloqueios" (antes do fechamento de `</main>`), adicionar:
    ```tsx
    {auth.user?.userType === 'admin' && (
      <section className={styles.section}>
        <h2>Sistema</h2>
        <p>Parâmetros de auditoria e jobs agendados do sistema — visível apenas para administradores.</p>
        <Link href="/barber/configuracoes/sistema" className={styles.systemLink}>
          Abrir configurações de sistema
        </Link>
      </section>
    )}
    ```
- Notes/Constraints: seção só aparece para `userType === 'admin'`; `dono` não vê nada novo nesta
  página (regra do epic).

### `barbearia-shelby-frontend/src/app/barber/configuracoes/Configuracoes.module.scss`
- Changes: adicionar ao final:
  ```scss
  .systemLink {
    @extend %button-base;
    display: inline-block;
    background-color: $brand-color;
    color: white;
    text-decoration: none;
  }
  ```
- Notes/Constraints: reusa o placeholder `%button-base` já definido no topo do arquivo.

## Files to Create

### `barbearia-backend/prisma/migrations/20260804220000_add_audit_and_job_config/migration.sql`
- Purpose: aplicar as 3 tabelas novas + seed idempotente dos valores default.
- Contents:
  ```sql
  -- CreateTable
  CREATE TABLE "AuditLog" (
      "id" SERIAL NOT NULL,
      "actorId" INTEGER NOT NULL,
      "actorName" TEXT NOT NULL,
      "actorRole" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "entity" TEXT NOT NULL,
      "entityId" TEXT,
      "metadata" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
  );

  -- CreateIndex
  CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

  -- CreateIndex
  CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

  -- CreateTable
  CREATE TABLE "AuditSettings" (
      "id" SERIAL NOT NULL,
      "retentionDays" INTEGER NOT NULL DEFAULT 90,
      "enabledModules" TEXT NOT NULL DEFAULT 'USERS,BUSINESS_HOURS,HOLIDAYS,PLANS',
      "updatedAt" TIMESTAMP(3) NOT NULL,

      CONSTRAINT "AuditSettings_pkey" PRIMARY KEY ("id")
  );

  -- CreateTable
  CREATE TABLE "JobConfig" (
      "id" SERIAL NOT NULL,
      "jobKey" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT false,
      "cronExpression" TEXT NOT NULL,
      "lastRunAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL,

      CONSTRAINT "JobConfig_pkey" PRIMARY KEY ("id")
  );

  -- CreateIndex
  CREATE UNIQUE INDEX "JobConfig_jobKey_key" ON "JobConfig"("jobKey");

  -- Seed default rows (idempotente, dados apenas — não destrutivo)
  INSERT INTO "AuditSettings" ("id", "retentionDays", "enabledModules", "updatedAt")
  VALUES (1, 90, 'USERS,BUSINESS_HOURS,HOLIDAYS,PLANS', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

  INSERT INTO "JobConfig" ("jobKey", "enabled", "cronExpression", "updatedAt")
  VALUES
    ('appointmentReminder', false, '0 9 * * *', CURRENT_TIMESTAMP),
    ('auditLogCleanup', false, '30 3 * * *', CURRENT_TIMESTAMP)
  ON CONFLICT ("jobKey") DO NOTHING;
  ```
- Integration points: nenhuma — arquivo isolado no diretório de migrations, reconhecido por
  `prisma migrate deploy`/`dev` pelo nome da pasta (timestamp + descrição).

### `barbearia-backend/src/services/auditService.ts`
- Purpose: única porta de entrada para ler/escrever `AuditLog`/`AuditSettings`.
- Contents:
  ```ts
  import { prisma } from './prisma.service';
  import { CustomError } from '../utils/customErrors';

  export type AuditActor = { id: number; role: string };
  export type AuditModule = 'USERS' | 'BUSINESS_HOURS' | 'HOLIDAYS' | 'PLANS';

  const ALL_MODULES: AuditModule[] = ['USERS', 'BUSINESS_HOURS', 'HOLIDAYS', 'PLANS'];
  const DEFAULT_MODULES_CSV = ALL_MODULES.join(',');

  export type AuditSettingsRow = {
      id: number;
      retentionDays: number;
      enabledModules: string;
      updatedAt: Date;
  };

  export type AuditLogRow = {
      id: number;
      actorId: number;
      actorName: string;
      actorRole: string;
      action: string;
      entity: string;
      entityId: string | null;
      metadata: string | null;
      createdAt: Date;
  };

  export class AuditService {
      async getSettings(): Promise<AuditSettingsRow> {
          const rows = await prisma.$queryRaw<AuditSettingsRow[]>`SELECT * FROM "AuditSettings" WHERE id = 1 LIMIT 1`;
          if (rows[0]) return rows[0];

          await prisma.$executeRaw`
              INSERT INTO "AuditSettings" ("id", "retentionDays", "enabledModules", "updatedAt")
              VALUES (1, 90, ${DEFAULT_MODULES_CSV}, CURRENT_TIMESTAMP)
              ON CONFLICT DO NOTHING
          `;
          const retry = await prisma.$queryRaw<AuditSettingsRow[]>`SELECT * FROM "AuditSettings" WHERE id = 1 LIMIT 1`;
          if (!retry[0]) {
              throw new CustomError('Não foi possível carregar configurações de auditoria.', 500);
          }
          return retry[0];
      }

      async updateSettings(data: { retentionDays: number; enabledModules: AuditModule[] }): Promise<AuditSettingsRow> {
          if (!Number.isInteger(data.retentionDays) || data.retentionDays < 1 || data.retentionDays > 3650) {
              throw new CustomError('Retenção em dias deve ser um número inteiro entre 1 e 3650.', 400);
          }
          const invalid = data.enabledModules.filter((m) => !ALL_MODULES.includes(m));
          if (!Array.isArray(data.enabledModules) || data.enabledModules.length === 0 || invalid.length > 0) {
              throw new CustomError('Módulos habilitados inválidos.', 400);
          }

          await this.getSettings(); // garante que a linha id=1 existe
          const csv = data.enabledModules.join(',');
          await prisma.$executeRaw`
              UPDATE "AuditSettings"
              SET "retentionDays" = ${data.retentionDays}, "enabledModules" = ${csv}, "updatedAt" = CURRENT_TIMESTAMP
              WHERE id = 1
          `;
          return this.getSettings();
      }

      async isModuleEnabled(moduleKey: AuditModule): Promise<boolean> {
          const settings = await this.getSettings();
          return settings.enabledModules.split(',').map((s) => s.trim()).includes(moduleKey);
      }

      // Nunca lança — falha ao registrar auditoria não pode quebrar a ação administrativa principal.
      async log(
          actor: AuditActor,
          moduleKey: AuditModule,
          action: string,
          entity: string,
          entityId: string | null,
          metadata?: Record<string, unknown>
      ): Promise<void> {
          try {
              const enabled = await this.isModuleEnabled(moduleKey);
              if (!enabled) return;

              const actorUser = await prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } });
              const actorName = actorUser?.name ?? `Usuário #${actor.id}`;
              const metadataJson = metadata ? JSON.stringify(metadata) : null;

              await prisma.$executeRaw`
                  INSERT INTO "AuditLog" ("actorId", "actorName", "actorRole", "action", "entity", "entityId", "metadata", "createdAt")
                  VALUES (${actor.id}, ${actorName}, ${actor.role}, ${action}, ${entity}, ${entityId}, ${metadataJson}, CURRENT_TIMESTAMP)
              `;
          } catch (err) {
              console.error('[AuditService] Falha ao registrar log de auditoria:', err);
          }
      }

      async listRecent(limit: number = 50): Promise<AuditLogRow[]> {
          const safeLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
          return prisma.$queryRaw<AuditLogRow[]>`
              SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT ${safeLimit}
          `;
      }
  }
  ```
- Integration points: usado por `userService`, `businessHoursService`, `holidayService`,
  `planService`, `adminSettings.controller.ts`, `auditLogCleanup.ts`.

### `barbearia-backend/src/services/jobConfigService.ts`
- Purpose: CRUD de `JobConfig` (não agenda nada sozinho — quem agenda é `schedulerManager`).
- Contents:
  ```ts
  import cron from 'node-cron';
  import { prisma } from './prisma.service';
  import { CustomError } from '../utils/customErrors';

  export type JobKey = 'appointmentReminder' | 'auditLogCleanup';
  export const VALID_JOB_KEYS: JobKey[] = ['appointmentReminder', 'auditLogCleanup'];

  export type JobConfigRow = {
      id: number;
      jobKey: string;
      enabled: boolean;
      cronExpression: string;
      lastRunAt: Date | null;
      updatedAt: Date;
  };

  export class JobConfigService {
      async listAll(): Promise<JobConfigRow[]> {
          return prisma.$queryRaw<JobConfigRow[]>`SELECT * FROM "JobConfig" ORDER BY "jobKey" ASC`;
      }

      async getByKey(jobKey: string): Promise<JobConfigRow | null> {
          const rows = await prisma.$queryRaw<JobConfigRow[]>`
              SELECT * FROM "JobConfig" WHERE "jobKey" = ${jobKey} LIMIT 1
          `;
          return rows[0] ?? null;
      }

      async update(jobKey: string, data: { enabled: boolean; cronExpression: string }): Promise<JobConfigRow> {
          if (!VALID_JOB_KEYS.includes(jobKey as JobKey)) {
              throw new CustomError('Job desconhecido.', 404);
          }
          if (typeof data.cronExpression !== 'string' || !cron.validate(data.cronExpression)) {
              throw new CustomError('Expressão cron inválida.', 400);
          }
          const existing = await this.getByKey(jobKey);
          if (!existing) {
              throw new CustomError('Job desconhecido.', 404);
          }

          await prisma.$executeRaw`
              UPDATE "JobConfig"
              SET "enabled" = ${data.enabled}, "cronExpression" = ${data.cronExpression}, "updatedAt" = CURRENT_TIMESTAMP
              WHERE "jobKey" = ${jobKey}
          `;
          const updated = await this.getByKey(jobKey);
          if (!updated) {
              throw new CustomError('Job desconhecido.', 404);
          }
          return updated;
      }

      async markRan(jobKey: string): Promise<void> {
          await prisma.$executeRaw`
              UPDATE "JobConfig" SET "lastRunAt" = CURRENT_TIMESTAMP WHERE "jobKey" = ${jobKey}
          `;
      }
  }
  ```
- Integration points: usado por `adminSettings.controller.ts` e `schedulerManager.ts`.

### `barbearia-backend/src/schedulers/auditLogCleanup.ts`
- Purpose: segundo job — aplica a retenção configurada apagando `AuditLog` antigo.
- Contents:
  ```ts
  import { prisma } from '../services/prisma.service';
  import { AuditService } from '../services/auditService';

  const auditService = new AuditService();

  export async function runAuditLogCleanupJob(): Promise<void> {
      const settings = await auditService.getSettings();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - settings.retentionDays);

      const deleted = await prisma.$executeRaw`
          DELETE FROM "AuditLog" WHERE "createdAt" < ${cutoff}
      `;
      console.log(`🧹 [auditLogCleanup] ${deleted} entrada(s) de audit log removida(s) (retenção: ${settings.retentionDays} dias).`);
  }
  ```
- Integration points: chamado pelo `schedulerManager` conforme `JobConfig` (`jobKey = 'auditLogCleanup'`).

### `barbearia-backend/src/schedulers/schedulerManager.ts`
- Purpose: registro em memória de tarefas `node-cron`, bootstrap na subida do servidor, reschedule
  sob demanda (chamado pelo controller ao salvar um `JobConfig`).
- Contents:
  ```ts
  import cron, { ScheduledTask } from 'node-cron';
  import { JobConfigService } from '../services/jobConfigService';
  import { runAppointmentReminderJob } from './appointmentReminder';
  import { runAuditLogCleanupJob } from './auditLogCleanup';

  const jobConfigService = new JobConfigService();
  const tasks = new Map<string, ScheduledTask>();

  const JOB_RUNNERS: Record<string, () => Promise<void>> = {
      appointmentReminder: runAppointmentReminderJob,
      auditLogCleanup: runAuditLogCleanupJob,
  };

  function scheduleJob(jobKey: string, cronExpression: string): void {
      const runner = JOB_RUNNERS[jobKey];
      if (!runner) return;

      const task = cron.schedule(cronExpression, async () => {
          try {
              await runner();
          } catch (err) {
              console.error(`[SchedulerManager] Job "${jobKey}" falhou:`, err);
          } finally {
              await jobConfigService.markRan(jobKey).catch(() => undefined);
          }
      });
      tasks.set(jobKey, task);
  }

  // Chamado uma vez na subida do servidor (server.ts). Não derruba o processo se a tabela
  // JobConfig ainda não existir (ex.: migration não aplicada nesse ambiente).
  export async function bootstrap(): Promise<void> {
      try {
          const configs = await jobConfigService.listAll();
          for (const config of configs) {
              if (config.enabled) {
                  scheduleJob(config.jobKey, config.cronExpression);
              }
          }
          console.log(`[SchedulerManager] ${tasks.size} job(s) agendado(s) na subida.`);
      } catch (err) {
          console.warn('[SchedulerManager] Não foi possível carregar JobConfig na subida:', (err as Error).message);
      }
  }

  // Chamado pelo adminSettings.controller depois de persistir um JobConfig atualizado.
  export async function reschedule(jobKey: string): Promise<void> {
      const existingTask = tasks.get(jobKey);
      if (existingTask) {
          existingTask.stop();
          tasks.delete(jobKey);
      }
      const config = await jobConfigService.getByKey(jobKey);
      if (config?.enabled) {
          scheduleJob(jobKey, config.cronExpression);
      }
  }
  ```
- Integration points: `bootstrap()` chamado por `server.ts`; `reschedule()` chamado por
  `adminSettings.controller.ts`.

### `barbearia-backend/src/controllers/adminSettings.controller.ts`
- Purpose: handlers das rotas `/api/admin-settings/*`.
- Contents:
  ```ts
  import { Request, Response } from 'express';
  import { AuditService, AuditModule } from '../services/auditService';
  import { JobConfigService } from '../services/jobConfigService';
  import { reschedule } from '../schedulers/schedulerManager';
  import { CustomError } from '../utils/customErrors';

  export class AdminSettingsController {
      private auditService = new AuditService();
      private jobConfigService = new JobConfigService();

      getAuditSettings = async (_req: Request, res: Response) => {
          try {
              const settings = await this.auditService.getSettings();
              return res.status(200).json({
                  retentionDays: settings.retentionDays,
                  enabledModules: settings.enabledModules.split(',').filter(Boolean),
              });
          } catch (err: any) {
              if (err instanceof CustomError) return res.status(err.statusCode).json({ error: err.message });
              console.error('Error getting audit settings:', err);
              return res.status(500).json({ error: 'Failed to get audit settings.' });
          }
      };

      updateAuditSettings = async (req: Request, res: Response) => {
          try {
              const { retentionDays, enabledModules } = req.body as { retentionDays: number; enabledModules: AuditModule[] };
              const settings = await this.auditService.updateSettings({ retentionDays, enabledModules });
              return res.status(200).json({
                  retentionDays: settings.retentionDays,
                  enabledModules: settings.enabledModules.split(',').filter(Boolean),
              });
          } catch (err: any) {
              if (err instanceof CustomError) return res.status(err.statusCode).json({ error: err.message });
              console.error('Error updating audit settings:', err);
              return res.status(500).json({ error: 'Failed to update audit settings.' });
          }
      };

      listAuditLog = async (req: Request, res: Response) => {
          try {
              const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
              const entries = await this.auditService.listRecent(limit ?? 50);
              return res.status(200).json(entries);
          } catch (err: any) {
              console.error('Error listing audit log:', err);
              return res.status(500).json({ error: 'Failed to list audit log.' });
          }
      };

      listJobs = async (_req: Request, res: Response) => {
          try {
              const jobs = await this.jobConfigService.listAll();
              return res.status(200).json(jobs);
          } catch (err: any) {
              console.error('Error listing jobs:', err);
              return res.status(500).json({ error: 'Failed to list jobs.' });
          }
      };

      updateJob = async (req: Request, res: Response) => {
          try {
              const { jobKey } = req.params;
              const { enabled, cronExpression } = req.body as { enabled: boolean; cronExpression: string };
              const updated = await this.jobConfigService.update(jobKey as string, { enabled, cronExpression });
              await reschedule(jobKey as string);
              return res.status(200).json(updated);
          } catch (err: any) {
              if (err instanceof CustomError) return res.status(err.statusCode).json({ error: err.message });
              console.error('Error updating job:', err);
              return res.status(500).json({ error: 'Failed to update job.' });
          }
      };
  }
  ```
- Integration points: montado por `adminSettings.routes.ts`.

### `barbearia-backend/src/routes/adminSettings.routes.ts`
- Purpose: rotas `/api/admin-settings/*`, exclusivas para `ADMIN`.
- Contents:
  ```ts
  import { Router } from 'express';
  import { AdminSettingsController } from '../controllers/adminSettings.controller';
  import authMiddleware from '../middlewares/auth.middleware';
  import requireRole from '../middlewares/requireRole.middleware';

  const router = Router();
  const controller = new AdminSettingsController();

  // Todas as rotas abaixo são exclusivas do papel ADMIN (não DONO) — Epic 11.
  router.get('/audit', authMiddleware, requireRole('ADMIN'), controller.getAuditSettings);
  router.put('/audit', authMiddleware, requireRole('ADMIN'), controller.updateAuditSettings);
  router.get('/audit-log', authMiddleware, requireRole('ADMIN'), controller.listAuditLog);
  router.get('/jobs', authMiddleware, requireRole('ADMIN'), controller.listJobs);
  router.put('/jobs/:jobKey', authMiddleware, requireRole('ADMIN'), controller.updateJob);

  export default router;
  ```
- Integration points: registrado em `src/routes/index.ts` como `/admin-settings`.

### `barbearia-shelby-frontend/src/hooks/useSystemSettings.tsx`
- Purpose: hook de dados da página `/barber/configuracoes/sistema`, mesmo padrão de
  `useBusinessSettings.tsx`.
- Contents:
  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import api from '@/services/api';
  import { useAuth } from '@/context/AuthContext';

  export type AuditModule = 'USERS' | 'BUSINESS_HOURS' | 'HOLIDAYS' | 'PLANS';
  export type AuditSettingsData = { retentionDays: number; enabledModules: AuditModule[] };
  export type AuditLogEntry = {
    id: number;
    actorId: number;
    actorName: string;
    actorRole: string;
    action: string;
    entity: string;
    entityId: string | null;
    metadata: string | null;
    createdAt: string;
  };
  export type JobConfigData = {
    id: number;
    jobKey: string;
    enabled: boolean;
    cronExpression: string;
    lastRunAt: string | null;
    updatedAt: string;
  };

  export function useSystemSettings() {
    const auth = useAuth();
    const [auditSettings, setAuditSettings] = useState<AuditSettingsData>({ retentionDays: 90, enabledModules: [] });
    const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
    const [jobs, setJobs] = useState<JobConfigData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getHeaders = useCallback(() => (auth?.token ? { Authorization: `Bearer ${auth.token}` } : undefined), [auth?.token]);

    const extractErrorMessage = (err: unknown, fallback: string) => {
      if (typeof err === 'object' && err !== null) {
        const maybeErr = err as { response?: { data?: { error?: string } }; message?: string };
        return maybeErr.response?.data?.error || maybeErr.message || fallback;
      }
      return fallback;
    };

    const fetchAll = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = getHeaders();
        const [settingsRes, logRes, jobsRes] = await Promise.all([
          api.get<AuditSettingsData>('/admin-settings/audit', { headers }),
          api.get<AuditLogEntry[]>('/admin-settings/audit-log', { headers }),
          api.get<JobConfigData[]>('/admin-settings/jobs', { headers }),
        ]);
        setAuditSettings(settingsRes.data);
        setAuditLog(logRes.data);
        setJobs(jobsRes.data);
      } catch (err) {
        setError(extractErrorMessage(err, 'Erro ao carregar configurações do sistema.'));
      } finally {
        setLoading(false);
      }
    }, [getHeaders]);

    const saveAuditSettings = useCallback(
      async (data: AuditSettingsData) => {
        setError(null);
        try {
          const headers = getHeaders();
          const res = await api.put<AuditSettingsData>('/admin-settings/audit', data, { headers });
          setAuditSettings(res.data);
        } catch (err) {
          const message = extractErrorMessage(err, 'Erro ao salvar parâmetros de auditoria.');
          setError(message);
          throw new Error(message);
        }
      },
      [getHeaders]
    );

    const saveJob = useCallback(
      async (jobKey: string, data: { enabled: boolean; cronExpression: string }) => {
        setError(null);
        try {
          const headers = getHeaders();
          const res = await api.put<JobConfigData>(`/admin-settings/jobs/${jobKey}`, data, { headers });
          setJobs((prev) => prev.map((j) => (j.jobKey === jobKey ? res.data : j)));
        } catch (err) {
          const message = extractErrorMessage(err, 'Erro ao salvar configuração do job.');
          setError(message);
          throw new Error(message);
        }
      },
      [getHeaders]
    );

    useEffect(() => {
      fetchAll();
    }, [fetchAll]);

    return { auditSettings, auditLog, jobs, loading, error, refetch: fetchAll, saveAuditSettings, saveJob };
  }
  ```
- Integration points: consumido por `barber/configuracoes/sistema/page.tsx`.

### `barbearia-shelby-frontend/src/app/barber/configuracoes/sistema/layout.tsx`
- Purpose: guard admin-only da subrota.
- Contents:
  ```tsx
  import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
  import React from 'react';

  export default function ConfiguracoesSistemaLayout({ children }: { children: React.ReactNode }) {
    return (
      <ProtectedRoute allowedUserType={['admin']}>
        {children}
      </ProtectedRoute>
    );
  }
  ```

### `barbearia-shelby-frontend/src/app/barber/configuracoes/sistema/page.tsx`
- Purpose: UI de auditoria + jobs.
- Contents:
  ```tsx
  'use client';

  import React, { useEffect, useState } from 'react';
  import Link from 'next/link';
  import { useSystemSettings, AuditModule, JobConfigData } from '@/hooks/useSystemSettings';
  import styles from './Sistema.module.scss';

  const MODULE_LABELS: Record<AuditModule, string> = {
    USERS: 'Usuários',
    BUSINESS_HOURS: 'Horário de Funcionamento',
    HOLIDAYS: 'Feriados',
    PLANS: 'Planos',
  };
  const ALL_MODULES: AuditModule[] = ['USERS', 'BUSINESS_HOURS', 'HOLIDAYS', 'PLANS'];

  const JOB_LABELS: Record<string, string> = {
    appointmentReminder: 'Lembrete de agendamento (email)',
    auditLogCleanup: 'Limpeza do log de auditoria',
  };

  function formatDateTime(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString('pt-BR');
  }

  function JobRow({ job, onSave }: { job: JobConfigData; onSave: (data: { enabled: boolean; cronExpression: string }) => Promise<void> }) {
    const [enabled, setEnabled] = useState(job.enabled);
    const [cronExpression, setCronExpression] = useState(job.cronExpression);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      setEnabled(job.enabled);
      setCronExpression(job.cronExpression);
    }, [job.enabled, job.cronExpression]);

    const handleSave = async () => {
      setSaving(true);
      try {
        await onSave({ enabled, cronExpression });
      } catch {
        // erro exposto via `error` do hook (renderizado no componente pai)
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className={styles.jobRow}>
        <span className={styles.jobLabel}>{JOB_LABELS[job.jobKey] ?? job.jobKey}</span>
        <label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Habilitado
        </label>
        <input
          type="text"
          value={cronExpression}
          onChange={(e) => setCronExpression(e.target.value)}
          placeholder="0 9 * * *"
        />
        <span className={styles.lastRun}>Última execução: {formatDateTime(job.lastRunAt)}</span>
        <button type="button" className={styles.saveButton} disabled={saving} onClick={handleSave}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    );
  }

  export default function ConfiguracoesSistemaPage() {
    const { auditSettings, auditLog, jobs, loading, error, saveAuditSettings, saveJob } = useSystemSettings();
    const [retentionDays, setRetentionDays] = useState(auditSettings.retentionDays);
    const [enabledModules, setEnabledModules] = useState<AuditModule[]>(auditSettings.enabledModules);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      setRetentionDays(auditSettings.retentionDays);
      setEnabledModules(auditSettings.enabledModules);
    }, [auditSettings]);

    const toggleModule = (moduleKey: AuditModule) => {
      setEnabledModules((prev) =>
        prev.includes(moduleKey) ? prev.filter((m) => m !== moduleKey) : [...prev, moduleKey]
      );
    };

    const handleSaveAudit = async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      try {
        await saveAuditSettings({ retentionDays, enabledModules });
      } catch {
        // erro já exposto via `error` do hook
      } finally {
        setSaving(false);
      }
    };

    return (
      <main className={styles.container}>
        <Link href="/barber/configuracoes" className={styles.backLink}>← Voltar para Configurações</Link>
        <h1>Configurações de Sistema</h1>
        {error && <p className={styles.error}>{error}</p>}
        {loading && <p>Carregando...</p>}

        <section className={styles.section}>
          <h2>Auditoria</h2>
          <form onSubmit={handleSaveAudit}>
            <label className={styles.retentionLabel}>
              Retenção (dias)
              <input
                type="number"
                min={1}
                max={3650}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
              />
            </label>
            <div className={styles.moduleList}>
              {ALL_MODULES.map((moduleKey) => (
                <label key={moduleKey}>
                  <input
                    type="checkbox"
                    checked={enabledModules.includes(moduleKey)}
                    onChange={() => toggleModule(moduleKey)}
                  />
                  {MODULE_LABELS[moduleKey]}
                </label>
              ))}
            </div>
            <button type="submit" className={styles.saveButton} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Auditoria'}
            </button>
          </form>

          <h3 className={styles.subheading}>Últimas ações registradas</h3>
          <ul className={styles.logList}>
            {auditLog.map((entry) => (
              <li key={entry.id}>
                <span className={styles.logDate}>{formatDateTime(entry.createdAt)}</span>
                <span>{entry.actorName} ({entry.actorRole})</span>
                <span>{entry.action}</span>
                <span>{entry.entity}{entry.entityId ? ` #${entry.entityId}` : ''}</span>
              </li>
            ))}
            {auditLog.length === 0 && <li>Nenhuma entrada registrada ainda.</li>}
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Filas / Jobs</h2>
          {jobs.map((job) => (
            <JobRow key={job.jobKey} job={job} onSave={(data) => saveJob(job.jobKey, data)} />
          ))}
          {jobs.length === 0 && !loading && <p>Nenhum job configurado.</p>}
        </section>
      </main>
    );
  }
  ```
- Integration points: usa `useSystemSettings`; guard de acesso vem do `layout.tsx` irmão.

### `barbearia-shelby-frontend/src/app/barber/configuracoes/sistema/Sistema.module.scss`
- Purpose: estilos da página, reaproveitando os tokens já usados em `Configuracoes.module.scss`.
- Contents:
  ```scss
  $card-bg: #1e1e1e;
  $border-color: #3a3a3a;
  $text-color: #f0f0f0;
  $text-muted: #a0a0a0;
  $brand-color: #f67366;
  $input-bg: #2a2a2a;

  %button-base {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.2s ease;

    &:hover {
      transform: translateY(-2px);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
  }

  .container {
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
    font-family: 'Poppins', sans-serif;
    color: $text-color;

    h1 {
      margin: 1rem 0 2rem;
      text-align: center;
    }
  }

  .backLink {
    color: $text-muted;
    text-decoration: none;

    &:hover {
      color: $brand-color;
    }
  }

  .error {
    background-color: rgba(#f67366, 0.15);
    border: 1px solid $brand-color;
    color: $brand-color;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .section {
    background-color: $card-bg;
    border: 1px solid $border-color;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 2rem;

    h2 {
      margin-bottom: 1.25rem;
      color: $text-color;
    }
  }

  .subheading {
    margin: 1.75rem 0 0.75rem;
    color: $text-color;
    font-size: 1rem;
  }

  .retentionLabel {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    color: $text-muted;

    input {
      background-color: $input-bg;
      border: 1px solid $border-color;
      border-radius: 8px;
      color: $text-color;
      padding: 0.4rem 0.6rem;
      width: 100px;
    }
  }

  .moduleList {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.25rem;

    label {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: $text-muted;
      font-size: 0.9rem;
    }
  }

  .saveButton {
    @extend %button-base;
    background-color: $brand-color;
    color: white;
  }

  .logList {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      padding: 0.6rem 0;
      border-top: 1px solid $border-color;
      color: $text-color;
      font-size: 0.85rem;

      &:first-child {
        border-top: none;
      }
    }
  }

  .logDate {
    color: $text-muted;
    min-width: 140px;
  }

  .jobRow {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 0;
    border-top: 1px solid $border-color;
    flex-wrap: wrap;

    &:first-of-type {
      border-top: none;
    }

    label {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: $text-muted;
      font-size: 0.9rem;
    }

    input[type='text'] {
      background-color: $input-bg;
      border: 1px solid $border-color;
      border-radius: 8px;
      color: $text-color;
      padding: 0.4rem 0.6rem;
      width: 140px;
    }
  }

  .jobLabel {
    min-width: 220px;
    font-weight: 600;
  }

  .lastRun {
    color: $text-muted;
    font-size: 0.85rem;
  }
  ```

## Implementation Order (recommended)
1. `prisma/schema.prisma` + migration SQL (Phase 1).
2. `auditService.ts` (Phase 2) → wiring nos 4 services + controllers existentes.
3. `EmailService.sendAppointmentReminder` → `appointmentReminder.ts` → `auditLogCleanup.ts` →
   `jobConfigService.ts` → `schedulerManager.ts` → `server.ts` (Phase 3).
4. `adminSettings.controller.ts` → `adminSettings.routes.ts` → `routes/index.ts` (Phase 4).
5. Frontend: `useSystemSettings.tsx` → `sistema/layout.tsx` → `sistema/page.tsx` →
   `Sistema.module.scss` → `configuracoes/page.tsx` + `Configuracoes.module.scss` (Phase 5).

## Validation (commands / checks)
- `cd barbearia-backend && npm run build`
- `cd barbearia-shelby-frontend && npm run build`
- `cd barbearia-shelby-frontend && npm run lint`
- Revisão manual do `migration.sql` (sem `DROP`/`ALTER`/`RENAME` destrutivo).
- Revisão manual confirmando `requireRole('ADMIN')` (não `'DONO','ADMIN'`) em todas as rotas de
  `adminSettings.routes.ts`.

## Notes
- `auditService.log()` engole exceções por design (log de auditoria não deve derrubar a ação
  principal) — qualquer falha vai só para `console.error`.
- `schedulerManager.bootstrap()` também engole exceções por design (servidor não deve falhar a
  subida por causa de uma tabela de config ainda não migrada em algum ambiente).
- Todas as tabelas novas são acessadas via `$queryRaw`/`$executeRaw` parametrizado (tagged
  template do Prisma — os valores interpolados viram bind parameters, não concatenação de string;
  sem risco de SQL injection), não via client tipado, por causa da limitação de regenerar o
  `@prisma/client` nesta sessão (ver `plan.md`, seção "Current State" e "Migration Notes").
