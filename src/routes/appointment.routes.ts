import { Router } from "express";
import { AppointmentController } from "../controllers/appointment.controller";


const router = Router();
const appointmentController = new AppointmentController();

router.post("/", appointmentController.create);
router.get("/", appointmentController.listAll);
router.get("/:id", appointmentController.getById);
router.patch("/:id", appointmentController.update);
router.delete("/:id", appointmentController.delete);

export default router;
