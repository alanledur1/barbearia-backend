import cron, { ScheduledTask } from 'node-cron';
import { JobConfigService } from '../services/jobConfigService';
import { runAppointmentReminderJob } from './appointmentReminder';
import { runAuditLogCleanupJob } from './auditLogCleanup';

// Epic 11 — gerenciador mínimo de jobs agendados sobre node-cron (sem Redis/BullMQ).
// Mantém em memória as tarefas node-cron ativas, lidas de JobConfig na subida do servidor, e
// permite reagendar uma tarefa específica quando o admin salva uma nova configuração.

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
// JobConfig ainda não existir (ex.: migration ainda não aplicada nesse ambiente).
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

// Chamado pelo adminSettings.controller depois de persistir um JobConfig atualizado — para a
// tarefa antiga (se existir) e cria uma nova conforme o estado atual em banco.
export async function reschedule(jobKey: string): Promise<void> {
    const existingTask = tasks.get(jobKey);
    if (existingTask) {
        await existingTask.stop();
        tasks.delete(jobKey);
    }
    const config = await jobConfigService.getByKey(jobKey);
    if (config?.enabled) {
        scheduleJob(jobKey, config.cronExpression);
    }
}
