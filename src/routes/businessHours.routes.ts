import { Router } from 'express';
import { BusinessHoursController } from '../controllers/businessHours.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';

const router = Router();
const controller = new BusinessHoursController();

router.get('/', authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'), controller.listAll);
router.put('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.updateBulk);

export default router;
