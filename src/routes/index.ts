import { Router } from 'express';
import clientRoutes from './client.routes';
import serviceRoutes from './service.routes';
import appointmentRoutes from './appointment.routes';
import authRoutes from './auth.routes'; 
import adminRoutes from './admin.routes';
import { UnifiedLoginController } from '../controllers/unifiedLogin.controller';
import { BillingController } from '../controllers/billing.controller';
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
router.get('/billing/summary', billingController.getSummary);

export default router;
