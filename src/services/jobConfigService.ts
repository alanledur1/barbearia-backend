import cron from 'node-cron';
import { prisma } from './prisma.service';
import { CustomError } from '../utils/customErrors';

// Epic 11 — Configurações do admin: auditoria e filas.
// JobConfig também é acessada via $queryRaw/$executeRaw pelo mesmo motivo documentado em
// auditService.ts (client Prisma não pôde ser regenerado nesta sessão de implementação).

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
