import { Router } from 'express';
import clientRoutes from './client.routes';
import serviceRoutes from './service.routes';
import appointmentRoutes from './appointment.routes';
import authRoutes from './auth.routes'; 
import adminRoutes from './admin.routes';
/* import adminRoutes from './admin.routes'; */

const router = Router();

router.use('/clients', clientRoutes);
router.use('/services', serviceRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);

export default router;
