import { Router } from "express";
import { AppointmentController } from "../controllers/appointment.controller";
import authMiddleware from "../middlewares/auth.middleware";
import requireRole from "../middlewares/requireRole.middleware";


const router = Router();
const appointmentController = new AppointmentController();

// Criação continua pública: preserva o agendamento de convidado (sem login)
router.post("/", appointmentController.create);
router.get("/", authMiddleware, appointmentController.listAll);
// Rotas públicas de apoio ao fluxo de agendamento (sem login): precisam vir antes de "/:id"
router.get("/barbers", appointmentController.listBarbers);
router.get("/availability", appointmentController.getAvailability);
router.get("/:id", authMiddleware, appointmentController.getById);
router.patch("/:id", authMiddleware, appointmentController.update);
router.delete("/:id", authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'), appointmentController.delete);

export default router;
