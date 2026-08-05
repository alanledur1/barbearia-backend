import { Router } from 'express';
import { AdminSettingsController } from '../controllers/adminSettings.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';

const router = Router();
const controller = new AdminSettingsController();

// Epic 11 — todas as rotas abaixo são exclusivas do papel ADMIN (não DONO), diferente do padrão
// requireRole('DONO', 'ADMIN') usado nas outras rotas de configuração do sistema.
router.get('/audit', authMiddleware, requireRole('ADMIN'), controller.getAuditSettings);
router.put('/audit', authMiddleware, requireRole('ADMIN'), controller.updateAuditSettings);
router.get('/audit-log', authMiddleware, requireRole('ADMIN'), controller.listAuditLog);
router.get('/jobs', authMiddleware, requireRole('ADMIN'), controller.listJobs);
router.put('/jobs/:jobKey', authMiddleware, requireRole('ADMIN'), controller.updateJob);

export default router;
