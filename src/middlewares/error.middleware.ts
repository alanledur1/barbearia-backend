import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { CustomError } from '../utils/customErrors';

// Esse middleware deve ser o ÚTILMO na lista de middlewares
const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
    // Logar o erro para depuração
    console.error(err);

    // --- Tratamento de erros de validação Zod ---
    if (err instanceof ZodError) {
        return res.status(400).json({
            message: "Erro de validação de dados",
            errors: err.issues.map(e => ({
                path: e.path.join('.'),
                message: e.message,
            })),
        });
    }

    // --- Tratamento de erros customizados ex.: ---

    if (err instanceof CustomError) {
        return res.status(err.statusCode).json({
            message: err.message,
            ...(err.details && { details: err.details }) 
        });
    } 

    // --- Tratamento de Erros JWT (já pode estar no authMiddleware, mas é bom ter um fallback) ---
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Token de autenticação inválido ou ausente.' });
    }
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token de autenticação expirado.' });
    }

    // --- Tratamento de Erros Padrão / Erros de Programação (Fallback) ---
    // Em desenvolvimento, você pode enviar mais detalhes.
    // Em produção, evite vazar informações sensíveis do stack trace.
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Um erro interno do servidor ocorreu.';

    if (process.env.NODE_ENV === 'production') {
        return res.status(statusCode).json({ message: 'Um erro inesperado ocorreu.' }); // Mensagem genérica em produção
    } else {
        return res.status(statusCode).json({
            message: message,
            stack: err.stack, // Apenas em desenvolvimento
        });
    }
};

export default errorMiddleware;