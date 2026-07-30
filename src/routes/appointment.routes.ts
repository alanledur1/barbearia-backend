import { Router } from "express";
import { AppointmentController } from "../controllers/appointment.controller";
import authMiddleware from "../middlewares/auth.middleware";
import requireRole from "../middlewares/requireRole.middleware";


const router = Router();
const appointmentController = new AppointmentController();

// Criação continua pública: preserva o agendamento de convidado (sem login)
router.post("/", appointmentController.create);
router.get("/", authMiddleware, appointmentController.listAll);
router.get("/:id", authMiddleware, appointmentController.getById);
router.patch("/:id", authMiddleware, appointmentController.update);
router.delete("/:id", authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'), appointmentController.delete);

export default router;
