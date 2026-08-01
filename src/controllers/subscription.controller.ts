import { Request, Response } from 'express';
import { SubscriptionService } from '../services/subscriptionService';
import { CustomError } from '../utils/customErrors';

export class SubscriptionController {
    private service = new SubscriptionService();

    subscribe = async (req: Request, res: Response) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
            const planId = parseInt(req.body.planId, 10);
            if (isNaN(planId)) {
                return res.status(400).json({ error: 'planId inválido.' });
            }
            const subscription = await this.service.subscribe(req.user.id, planId);
            return res.status(201).json(subscription);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error subscribing to plan:', err);
            return res.status(500).json({ error: 'Failed to subscribe to plan.' });
        }
    };

    getMine = async (req: Request, res: Response) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
            const subscription = await this.service.getMine(req.user.id);
            return res.status(200).json(subscription);
        } catch (err: any) {
            console.error('Error getting subscription:', err);
            return res.status(500).json({ error: 'Failed to get subscription.' });
        }
    };

    cancelMine = async (req: Request, res: Response) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
            await this.service.cancelMine(req.user.id);
            return res.status(204).send();
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error cancelling subscription:', err);
            return res.status(500).json({ error: 'Failed to cancel subscription.' });
        }
    };
}
