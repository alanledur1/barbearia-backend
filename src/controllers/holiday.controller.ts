import { Request, Response } from 'express';
import { HolidayService } from '../services/holidayService';
import { CustomError } from '../utils/customErrors';

export class HolidayController {
    private service = new HolidayService();

    listAll = async (_req: Request, res: Response) => {
        try {
            const holidays = await this.service.listAll();
            return res.status(200).json(holidays);
        } catch (err: any) {
            console.error('Error listing holidays:', err);
            return res.status(500).json({ error: 'Failed to retrieve holidays.' });
        }
    };

    create = async (req: Request, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Não autenticado.' });
            }
            const { date, reason } = req.body;
            if (!date) {
                return res.status(400).json({ error: 'A data é obrigatória.' });
            }
            const holiday = await this.service.create({ id: req.user.id, role: req.user.role }, { date, reason });
            return res.status(201).json(holiday);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error creating holiday:', err);
            return res.status(500).json({ error: 'Failed to create holiday.' });
        }
    };

    delete = async (req: Request, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Não autenticado.' });
            }
            const { id } = req.params;
            const holidayId = parseInt(id as string, 10);
            if (isNaN(holidayId)) {
                return res.status(400).json({ error: 'ID de feriado inválido.' });
            }
            await this.service.delete({ id: req.user.id, role: req.user.role }, holidayId);
            return res.status(204).send();
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error deleting holiday:', err);
            return res.status(500).json({ error: 'Failed to delete holiday.' });
        }
    };
}
