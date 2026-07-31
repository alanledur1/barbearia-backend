import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';

const router = Router();
const controller = new UserController();

// CRUD de usuários (clientes/barbeiros/donos) restrito ao papel DONO.
// Gestão de ADMIN fica fora desta feature (ver PRD/Plan do Epic 4).
router.get('/', authMiddleware, requireRole('DONO'), controller.listAll);
router.get('/:id', authMiddleware, requireRole('DONO'), controller.getById);
router.post('/', authMiddleware, requireRole('DONO'), controller.create);
router.put('/:id', authMiddleware, requireRole('DONO'), controller.update);

export default router;
