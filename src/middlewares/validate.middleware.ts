import { Request, Response, NextFunction } from "express";
import { ZodObject, ZodError } from "zod";

// Middleware generico de validacao
const validate = (schema: ZodObject) => (req: Request, res: Response, next: NextFunction) => {
    try {
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next(); // Se os dados forem validos, passa para o proximo middleware ou handler
    } catch (error: any) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                message: 'Dados de entrada inválidos',
                errors: error.issues.map(e => ({
                    path: e.path.join('.'),
                    message: e.message,
                })),
            });
        }
        next(error); // Se houver um erro de validacao, retorna o erro para o handler
    }
};

export default validate;