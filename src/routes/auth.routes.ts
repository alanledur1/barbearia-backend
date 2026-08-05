// src/routes/auth.routes.ts
import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { createAdminSchema } from "../schemas/admin.schemas";
import { forgotPasswordSchema, verifyResetOtpSchema, resetPasswordSchema } from "../schemas/auth.schemas";
import validate from "../middlewares/validate.middleware";
import authMiddleware from "../middlewares/auth.middleware";
import requireRole from "../middlewares/requireRole.middleware";


const authRouter = Router();
const authController = new AuthController();


// Rota para registrar um novo usuário de staff (barbeiro/dono/admin).
// Só dono/admin podem criar staff — não é mais autocadastro público.
// Ex.: POST /api/auth/register
authRouter.post('/register', authMiddleware, requireRole('DONO', 'ADMIN'), validate(createAdminSchema), authController.register.bind(authController));
// Rota para fazer login de um usuário de staff
// Ex.: POST /api/auth/login
authRouter.post('/login', authController.login.bind(authController)); // A validação de login pode ser mais simples ou feita no controller

// Fluxo "Esqueci Senha" — rotas públicas (sem authMiddleware), OTP de 6 dígitos via email.
// Ex.: POST /api/auth/forgot-password
authRouter.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword.bind(authController));
// Ex.: POST /api/auth/verify-reset-otp
authRouter.post('/verify-reset-otp', validate(verifyResetOtpSchema), authController.verifyResetOtp.bind(authController));
// Ex.: POST /api/auth/reset-password
authRouter.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword.bind(authController));



export default authRouter;
