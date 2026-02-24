import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { ClientService } from "../services/clientService";
import { CustomError } from "../utils/customErrors";

export class UnifiedLoginController {
    private authService: AuthService;
    private clientService: ClientService;
    
    constructor() {
        this.authService = new AuthService();
        this.clientService = new ClientService();
    }

    async login(req: Request, res: Response) {
        const  { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
        }

        try {
            const adminData = await this.authService.login(email,password);
            return res.status(200).json({
                ...adminData,
                userType: 'admin'
            });
        } catch (adminError) {
            // Se o login de admin falhar, não tem problema. Vamos tentar como cliente.
            try {
                // 2. Tenta fazer login como Cliente.
                const clientData = await this.clientService.login(email, password);
                return res.status(200).json({
                    ...clientData,
                    userType: 'client' // Adiciona o campo de tipo de usuário
                });
            } catch (clientError) {
                // 3. Se ambos os logins falharem, retorna erro de credenciais inválidas.
                // Usamos o erro do clientService que já tem o status code 401.
                if (clientError instanceof CustomError) {
                    return res.status(clientError.statusCode).json({ error: clientError.message });
                }
                // Fallback para um erro genérico
                return res.status(401).json({ error: 'Email ou senha inválidos.' });
            }
        }
    }
}