import { Router } from 'express';
import clientRoutes from './client.routes';
import serviceRoutes from './service.routes';
import appointmentRoutes from './appointment.routes';
import authRoutes from './auth.routes'; 
import adminRoutes from './admin.routes';
import businessHoursRoutes from './businessHours.routes';
import holidayRoutes from './holiday.routes';
import userRoutes from './user.routes';
import { UnifiedLoginController } from '../controllers/unifiedLogin.controller';
import { BillingController } from '../controllers/billing.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';
/* import adminRoutes from './admin.routes'; */

const router = Router();
const unifiedLoginController = new UnifiedLoginController();
const billingController = new BillingController();

router.post('/login', (req, res) => unifiedLoginController.login(req, res));
router.use('/clients', clientRoutes);
router.use('/services', serviceRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/business-hours', businessHoursRoutes);
router.use('/holidays', holidayRoutes);
router.use('/users', userRoutes);
router.get('/billing/summary', authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'), billingController.getSummary);
router.get('/billing/summary/by-barber', authMiddleware, requireRole('DONO', 'ADMIN'), billingController.getSummaryByBarber);

export default router;
