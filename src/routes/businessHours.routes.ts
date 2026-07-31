import { Router } from 'express';
import { BusinessHoursController } from '../controllers/businessHours.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';

const router = Router();
const controller = new BusinessHoursController();

router.get('/', authMiddleware, requireRole('DONO'), controller.listAll);
router.put('/', authMiddleware, requireRole('DONO'), controller.updateBulk);

export default router;
