import { Request, Response } from 'express';
import { PlanService } from '../services/planService';
import { CustomError } from '../utils/customErrors';

export class PlanController {
    private service = new PlanService();

    listActive = async (_req: Request, res: Response) => {
        try {
            const plans = await this.service.listActive();
            return res.status(200).json(plans);
        } catch (err: any) {
            console.error('Error listing plans:', err);
            return res.status(500).json({ error: 'Failed to list plans.' });
        }
    };

    listAll = async (_req: Request, res: Response) => {
        try {
            const plans = await this.service.listAll();
            return res.status(200).json(plans);
        } catch (err: any) {
            console.error('Error listing all plans:', err);
            return res.status(500).json({ error: 'Failed to list plans.' });
        }
    };

    getById = async (req: Request, res: Response) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'ID de plano inválido.' });
            }
            const plan = await this.service.findById(id);
            return res.status(200).json(plan);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error getting plan:', err);
            return res.status(500).json({ error: 'Failed to get plan.' });
        }
    };

    create = async (req: Request, res: Response) => {
        try {
            const { name, description, cutsPerCycle, price, benefits } = req.body;
            const plan = await this.service.create({ name, description, cutsPerCycle, price, benefits });
            return res.status(201).json(plan);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error creating plan:', err);
            return res.status(500).json({ error: 'Failed to create plan.' });
        }
    };

    update = async (req: Request, res: Response) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'ID de plano inválido.' });
            }
            const plan = await this.service.update(id, req.body);
            return res.status(200).json(plan);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error updating plan:', err);
            return res.status(500).json({ error: 'Failed to update plan.' });
        }
    };
}
