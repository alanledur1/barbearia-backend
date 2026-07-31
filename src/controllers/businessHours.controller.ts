import { Request, Response } from 'express';
import { BusinessHoursService } from '../services/businessHoursService';
import { CustomError } from '../utils/customErrors';

export class BusinessHoursController {
    private service = new BusinessHoursService();

    listAll = async (_req: Request, res: Response) => {
        try {
            const businessHours = await this.service.listAll();
            return res.status(200).json(businessHours);
        } catch (err: any) {
            console.error('Error listing business hours:', err);
            return res.status(500).json({ error: 'Failed to retrieve business hours.' });
        }
    };

    updateBulk = async (req: Request, res: Response) => {
        try {
            const updated = await this.service.updateBulk(req.body);
            return res.status(200).json(updated);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error updating business hours:', err);
            return res.status(500).json({ error: 'Failed to update business hours.' });
        }
    };
}
