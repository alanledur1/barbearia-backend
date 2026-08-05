import { prisma } from '../services/prisma.service';
import { AuditService } from '../services/auditService';

const auditService = new AuditService();

// Epic 11 — segundo job configurável (jobKey = 'auditLogCleanup'). Aplica a retenção configurada
// em AuditSettings.retentionDays apagando entradas de AuditLog mais antigas que o limite.
export async function runAuditLogCleanupJob(): Promise<void> {
    const settings = await auditService.getSettings();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - settings.retentionDays);

    const deleted = await prisma.$executeRaw`
        DELETE FROM "AuditLog" WHERE "createdAt" < ${cutoff}
    `;
    console.log(`🧹 [auditLogCleanup] ${deleted} entrada(s) de audit log removida(s) (retenção: ${settings.retentionDays} dias).`);
}
