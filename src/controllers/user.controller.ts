import { Request, Response } from 'express';
import { UserService } from '../services/userService';
import { CustomError } from '../utils/customErrors';

export class UserController {
    private service = new UserService();

    listAll = async (req: Request, res: Response) => {
        try {
            const role = typeof req.query.role === 'string' ? req.query.role : undefined;
            const users = await this.service.listAll(role);
            return res.status(200).json(users);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error listing users:', err);
            return res.status(500).json({ error: 'Failed to list users.' });
        }
    };

    getById = async (req: Request, res: Response) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'ID de usuário inválido.' });
            }
            const user = await this.service.findById(id);
            return res.status(200).json(user);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error getting user:', err);
            return res.status(500).json({ error: 'Failed to get user.' });
        }
    };

    create = async (req: Request, res: Response) => {
        try {
            const { name, email, phone, password, role } = req.body;
            const user = await this.service.create({ name, email, phone, password, role });
            return res.status(201).json(user);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error creating user:', err);
            return res.status(500).json({ error: 'Failed to create user.' });
        }
    };

    update = async (req: Request, res: Response) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'ID de usuário inválido.' });
            }
            if (!req.user) {
                return res.status(401).json({ error: 'Não autenticado.' });
            }
            const user = await this.service.update(req.user.id, id, req.body);
            return res.status(200).json(user);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error updating user:', err);
            return res.status(500).json({ error: 'Failed to update user.' });
        }
    };
}
