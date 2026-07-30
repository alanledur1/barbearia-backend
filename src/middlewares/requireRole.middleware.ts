import { Request, Response, NextFunction } from 'express';

export const requireRole = (...roles: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Acesso não permitido para este papel de usuário.' });
        }
        next();
    };

export default requireRole;
