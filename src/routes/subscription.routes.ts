import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';

const router = Router();
const controller = new SubscriptionController();

router.post('/', authMiddleware, requireRole('CLIENTE'), controller.subscribe);
router.get('/me', authMiddleware, requireRole('CLIENTE'), controller.getMine);
router.patch('/me/cancel', authMiddleware, requireRole('CLIENTE'), controller.cancelMine);

export default router;
