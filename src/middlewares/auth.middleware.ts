import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyUserToken } from '../utils/jwt';

// Estende a interface Request do Express para incluir a propriedade 'user'
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: number;
                role: string;
                email: string | null;
            };
        }
    }
}

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {

    // 1. verifica a presença do token de autenticação no cabeçalho da requisição
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido ou mal formatado.' });
    }

    // Extrai o token da string 'Bearer <token>'
    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de autenticação inválido.' });
    }

    try {
        // 2. Verifica a validade do token e decodifica o payload
        const decoded = verifyUserToken(token);

        // 3. Anexa as informações do usuário ao objeto req
        req.user = {
            id: decoded.userId,
            role: decoded.role,
            email: decoded.email,
        };

        // Continua para a próxima função middleware ou para a rota
        next();
    } catch (error){
        // 4. Se inválido, retorna uma resposta de erro 401 ou 403 (forbidden)
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ error: 'Token de autenticação expirado.' });
        }
        return res.status(403).json({ error: 'Token de autenticação inválido.' });
    }
};

// Exporta o middleware para ser usado em rotas que necessitem de autenticação
export default authMiddleware;
