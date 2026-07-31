import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import authMiddleware from '../middlewares/auth.middleware';
import requireRole from '../middlewares/requireRole.middleware';

const router = Router();
const controller = new UserController();

// CRUD de usuários (clientes/barbeiros/donos), acessível a DONO e ADMIN (Epic 5).
// Gestão de contas ADMIN (criar/editar/listar admins) continua fora desta feature
// (ver PRD/Plan do Epic 4) — só quem pode CHAMAR a API mudou, não quais papéis são gerenciáveis.
router.get('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.listAll);
router.get('/:id', authMiddleware, requireRole('DONO', 'ADMIN'), controller.getById);
router.post('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.create);
router.put('/:id', authMiddleware, requireRole('DONO', 'ADMIN'), controller.update);

export default router;
