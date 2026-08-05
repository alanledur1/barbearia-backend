import { Request, Response } from 'express';
import { AuditService, AuditModule } from '../services/auditService';
import { JobConfigService } from '../services/jobConfigService';
import { reschedule } from '../schedulers/schedulerManager';
import { CustomError } from '../utils/customErrors';

// Epic 11 — handlers das rotas /api/admin-settings/* (exclusivas do papel ADMIN).
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
