import { Router } from 'express';
import { HolidayController } from '../controllers/holiday.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';

const router = Router();
const controller = new HolidayController();

// Leitura pública: o wizard de agendamento (visitante/cliente) precisa saber quais datas estão
// bloqueadas. Não é dado sensível.
router.get('/', controller.listAll);
router.post('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.create);
router.delete('/:id', authMiddleware, requireRole('DONO', 'ADMIN'), controller.delete);

export default router;
