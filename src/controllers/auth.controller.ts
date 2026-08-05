// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service'; // Importa o AuthService
import { CustomError } from '../utils/customErrors';

export class AuthController {
    private authService: AuthService; // 1. Declare a propriedade da classe

    constructor() {
        this.authService = new AuthService(); // 2. Inicialize a instância do AuthService no construtor
    }

    // 1. Método para Registrar um novo usuário de staff (barbeiro/dono/admin)
    async register(req: Request, res: Response) {
        try {
            const { name, email, password, phone, role } = req.body;

            if (!name || !email || !password || !role) {
                return res.status(400).json({ error: 'Name, email, password, and role are required.' });
            }

            // Chama o serviço para registrar o usuário usando 'this.authService'
            const newUser = await this.authService.register({ name, email, password, phone, role });

            return res.status(201).json(newUser);
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

            // Chama o serviço para autenticar o usuário e obter o token usando 'this.authService'
            const { token, user } = await this.authService.login(email, password);

            return res.status(200).json({ token, user });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                return res.status(400).json({ errors: error.issues });
            }
            return res.status(401).json({ error: error.message });
        }
    }

    // 3. Passo 1 do fluxo "Esqueci Senha": solicita o envio do código OTP.
    async forgotPassword(req: Request, res: Response) {
        try {
            const { email } = req.body;
            await this.authService.forgotPassword(email);
            // Resposta sempre genérica — não revela se o email existe na base.
            return res.status(200).json({
                message: 'Se o email existir em nossa base, um código de verificação foi enviado.',
            });
        } catch (error: any) {
            // Só chega aqui se o email existe mas o envio falhou (SMTP indisponível) —
            // esse caso precisa avisar o usuário, sem revelar se o email existe.
            console.error('Erro ao processar solicitação de recuperação de senha:', error);
            return res.status(502).json({ error: 'Não foi possível enviar o email agora. Tente novamente em instantes.' });
        }
    }

    // 4. Passo 2: verifica o código OTP digitado.
    async verifyResetOtp(req: Request, res: Response) {
        try {
            const { email, code } = req.body;
            await this.authService.verifyResetOtp(email, code);
            return res.status(200).json({ valid: true });
        } catch (error: any) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            console.error('Erro ao verificar código de recuperação de senha:', error);
            return res.status(500).json({ error: 'Erro ao verificar código.' });
        }
    }

    // 5. Passo 3: redefine a senha usando o código OTP.
    async resetPassword(req: Request, res: Response) {
        try {
            const { email, code, newPassword } = req.body;
            await this.authService.resetPassword(email, code, newPassword);
            return res.status(200).json({ message: 'Senha alterada com sucesso.' });
        } catch (error: any) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            console.error('Erro ao redefinir senha:', error);
            return res.status(500).json({ error: 'Erro ao redefinir senha.' });
        }
    }
}