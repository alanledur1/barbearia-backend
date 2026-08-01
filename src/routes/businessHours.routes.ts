import { Router } from 'express';
import { BusinessHoursController } from '../controllers/businessHours.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';

const router = Router();
const controller = new BusinessHoursController();

// Leitura pública: o wizard de agendamento (visitante/cliente) precisa saber o horário de
// funcionamento para montar os horários disponíveis. Não é dado sensível.
router.get('/', controller.listAll);
router.put('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.updateBulk);

export default router;
