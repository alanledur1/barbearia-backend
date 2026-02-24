import { Router } from "express";
import { ClientController } from "../controllers/clientController";

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


router.get("/", clientController.listAll);
router.get("/:id", clientController.getById);
router.put("/:id", clientController.update);
router.delete("/:id", clientController.delete);

export default router;