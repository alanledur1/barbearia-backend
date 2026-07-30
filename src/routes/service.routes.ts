import { Router } from "express";
import { ServiceController } from "../controllers/service.controller";
import authMiddleware from "../middlewares/auth.middleware";
import requireRole from "../middlewares/requireRole.middleware";


const router = Router();
const serviceController = new ServiceController();

router.post("/", authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'), serviceController.create);
router.get("/", serviceController.listAll);
router.get("/:id", serviceController.getById);
router.put("/:id", authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'), serviceController.update);
router.delete("/:id", authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'), serviceController.delete);

export default router;
