import { prisma } from './prisma.service';
import { CustomError } from '../utils/customErrors';

// Epic 11 — Configurações do admin: auditoria e filas.
//
// AuditLog/AuditSettings são acessadas via $queryRaw/$executeRaw (não via client tipado do
// Prisma) porque o ambiente onde este arquivo foi escrito não tinha acesso de rede para rodar
// `npx prisma generate` e incluir os models novos no client gerado. Os valores interpolados nas
// tagged templates abaixo viram bind parameters (não concatenação de string) — sem risco de SQL
// injection. Ver SDD/PLAN e SDD/SPEC deste epic para o detalhe da decisão.

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
    // Retorna a linha única de configurações (id = 1), criando-a com os defaults se ainda não existir.
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

    // Registra uma entrada de auditoria se o módulo estiver habilitado. Nunca lança — uma falha ao
    // registrar auditoria não pode quebrar a ação administrativa principal que a chamou.
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
