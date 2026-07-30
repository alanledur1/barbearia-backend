import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { CustomError } from "../utils/customErrors";

export class UnifiedLoginController {
    private authService: AuthService;

    constructor() {
        this.authService = new AuthService();
    }

    async login(req: Request, res: Response) {
        const  { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
        }

        try {
            const { token, user } = await this.authService.login(email, password);
            return res.status(200).json({
                token,
                user,
                userType: user.role.toLowerCase(),
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            return res.status(401).json({ error: 'Email ou senha inválidos.' });
        }
    }
}
