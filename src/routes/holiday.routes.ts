import { Router } from 'express';
import { HolidayController } from '../controllers/holiday.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';

const router = Router();
const controller = new HolidayController();

router.get('/', authMiddleware, requireRole('DONO'), controller.listAll);
router.post('/', authMiddleware, requireRole('DONO'), controller.create);
router.delete('/:id', authMiddleware, requireRole('DONO'), controller.delete);

export default router;
