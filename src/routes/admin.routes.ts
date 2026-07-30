// src/routes/admin.routes.ts
import { Router } from "express";
import { AdminController } from "../controllers/admin.controller"; // Corrected import syntax if needed
import authMiddleware from "../middlewares/auth.middleware";
import requireRole from "../middlewares/requireRole.middleware";
/* import validate from "../middlewares/validate.middleware"; */
import { updateAdminSchema } from "../schemas/admin.schemas";

const router = Router();
const adminController = new AdminController();


// Rotas protegidas: só dono/admin gerenciam contas de staff
router.get("/", authMiddleware, requireRole('DONO', 'ADMIN'), adminController.listAll.bind(adminController));
router.get("/:id", authMiddleware, requireRole('DONO', 'ADMIN')/* , validate(updateAdminSchema) */, adminController.getById.bind(adminController));
router.put("/:id", authMiddleware, requireRole('DONO', 'ADMIN')/* ,validate(updateAdminSchema) */, adminController.update.bind(adminController));
router.delete("/:id", authMiddleware, requireRole('DONO', 'ADMIN'), adminController.delete.bind(adminController));

export default router;
