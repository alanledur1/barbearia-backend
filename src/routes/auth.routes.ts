// src/routes/auth.routes.ts
import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { createAdminSchema } from "../schemas/admin.schemas";
import validate from "../middlewares/validate.middleware";


const authRouter = Router();
const authController = new AuthController();


// Rota para registrar um novo administrador
// Ex.: POST /api/auth/register
authRouter.post('/register', validate(createAdminSchema), authController.register.bind(authController));
// Rota para fazer login de um adminitrador
// Ex.: POST /api/auth/login
authRouter.post('/login', authController.login.bind(authController)); // A validação de login pode ser mais simples ou feita no controller



export default authRouter;
