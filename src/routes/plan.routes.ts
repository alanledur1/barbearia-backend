import { Router } from 'express';
import { PlanController } from '../controllers/plan.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';

const router = Router();
const controller = new PlanController();

// Leitura pública: só planos ativos (catálogo para quem pode assinar).
router.get('/', controller.listActive);
// Gestão (DONO/ADMIN): todos os planos, inclusive inativos. Precisa vir antes de "/:id".
router.get('/all', authMiddleware, requireRole('DONO', 'ADMIN'), controller.listAll);
router.get('/:id', controller.getById);
router.post('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.create);
router.put('/:id', authMiddleware, requireRole('DONO', 'ADMIN'), controller.update);

export default router;
