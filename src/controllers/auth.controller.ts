// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service'; // Importa o AuthService

export class AuthController {
    private authService: AuthService; // 1. Declare a propriedade da classe

    constructor() {
        this.authService = new AuthService(); // 2. Inicialize a instância do AuthService no construtor
    }

    // 1. Método para Registrar um novo Admin
    async register(req: Request, res: Response) {
        try {
            const { name, email, password } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({ error: 'Name, email, and password are required.' });
            }

            // Chama o serviço para registrar o admin usando 'this.authService'
            const newAdmin = await this.authService.register({ name, email, password });

            return res.status(201).json(newAdmin);
        } catch (error: any) {
            if (error.name === 'ZodError') {
                return res.status(400).json({ errors: error.issues });
            }
            return res.status(400).json({ error: error.message });
        }
    }

    // 2. Método para Fazer Login de um Admin
    async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required.' });
            }

            // Chama o serviço para autenticar o admin e obter o token usando 'this.authService'
            const { token, admin } = await this.authService.login(email, password);

            return res.status(200).json({ token, admin });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                return res.status(400).json({ errors: error.issues });
            }
            return res.status(401).json({ error: error.message });
        }
    }
}