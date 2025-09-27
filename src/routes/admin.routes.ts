// src/routes/admin.routes.ts
import { Router } from "express";
import { AdminController } from "../controllers/admin.controller"; // Corrected import syntax if needed
import authMiddleware from "../middlewares/auth.middleware";
/* import validate from "../middlewares/validate.middleware"; */
import { updateAdminSchema } from "../schemas/admin.schemas";

const router = Router();
const adminController = new AdminController();


// Rotas protegidas com middleware (apenas usuários com JWT válido podem acessá-las)
router.get("/", authMiddleware, adminController.listAll.bind(adminController)); 
router.get("/:id",authMiddleware/* , validate(updateAdminSchema) */, adminController.getById.bind(adminController)); 
router.put("/:id",authMiddleware/* ,validate(updateAdminSchema) */, adminController.update.bind(adminController)); 
router.delete("/:id",authMiddleware, adminController.delete.bind(adminController)); 

export default router;