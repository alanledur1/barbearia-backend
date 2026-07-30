import { Router } from "express";
import { ClientController } from "../controllers/clientController";
import authMiddleware from "../middlewares/auth.middleware";
import requireRole from "../middlewares/requireRole.middleware";

const router = Router();
const clientController = new ClientController();

// Rota para criar uma nova conta de cliente
// Rota para criação explícita de cliente
// Observação: criação automática de cliente via fluxo de agendamento foi
// desativada por decisão de design. Para criar um cliente use /signup.
router.post("/", (req, res) => {
	return res.status(405).json({
		error: 'Criação de cliente via POST /api/clients desativada. Use POST /api/clients/signup para registrar um cliente ou POST /api/appointments para agendar um horário.'
	});
});

// Rota para criar uma nova conta de cliente (signup)
router.post("/signup", (req, res) => clientController.register(req, res));

// Rota para login de cliente
router.post("/login", (req, res) => clientController.login(req, res));

// Listar todos os clientes: só dono/admin
router.get("/", authMiddleware, requireRole('DONO', 'ADMIN'), clientController.listAll);
// Ver/editar um cliente: o próprio cliente ou dono/admin (checado no controller)
router.get("/:id", authMiddleware, clientController.getById);
router.put("/:id", authMiddleware, clientController.update);
// Deletar cliente: só dono/admin
router.delete("/:id", authMiddleware, requireRole('DONO', 'ADMIN'), clientController.delete);

export default router;
