import { Request, Response } from 'express';
import { ServiceService } from '../services/serviceService';
import { CustomError } from '../utils/customErrors';
import { error } from 'console';

export class ServiceController {
    async create(req: Request, res: Response) {
        try {
            const { name, description , price, duration } = req.body;

            if (!name || description === undefined || price === undefined || duration === undefined) {
                return res.status(400).json({ error: 'Name, description, price, and duration are required.' });
            }

            // Instancia o serviço
            const serviceService = new ServiceService();

            // Chama o método create do serviço com os dados
            const newService = await serviceService.create({ name, description ,price, duration });
            return res.status(201).json(newService);
        } catch (err: any) {
            // Tratamento de erro de validação
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.issues });
            }
            return res.status(400).json({ error: err.message });
        }
    }

    async listAll(req: Request, res: Response) {
        try {
            const serviceService = new ServiceService();
            const services = await serviceService.listAll();
            return res.status(200).json(services);
        } catch (err: any) {
            console.error("Error listing services:", err);
            return res.status(500).json({ error: 'Failed to retrieve services.' });
        }
    }

    // Método para buscar um serviço por ID
    async getById(req: Request, res: Response) {
        try {
            const { id } = req.params; // o id vira da URL, ex.: services/123

            // Converte o id para um número
            const serviceId = parseInt(id, 10);
            if (isNaN(serviceId)) {
                return res.status(400).json({ error: 'Invalid service ID format.' });
            }

            const serviceService = new ServiceService();
            const service = await serviceService.findById(serviceId);

            if (!service) {
                return res.status(404).json({ error: 'Service not found.' });
            }
            return res.status(200).json(service);
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    // Método para atualizar um serviço
    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const serviceId = parseInt(id, 10);
            if (isNaN(serviceId)) {
                return res.status(400).json({ error: 'Invalid service ID format.' });
            }

            const dataToUpdate = req.body; // Pega o body diretamente

            const serviceService = new ServiceService();
            const updatedService = await serviceService.update(serviceId, dataToUpdate);

            if (!updatedService) {
                return res.status(404).json({ error: 'Service not found or could not be update.' });
            }
            return res.status(200).json(updatedService);
        } catch (err: any) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.issues }); // Erros de validacao Zod
            }
            return res.status(400).json({ error: err.message });
        }
    }

    // Método para deletar um serviço
    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            
            const serviceId = parseInt(id, 10);
            if (isNaN(serviceId)) {
                return res.status(400).json({ error: 'Invalid service ID format.' });
            }

            const serviceService = new ServiceService();

            const deletedService = await serviceService.delete(serviceId);

            if (!deletedService) {
                return res.status(404).json({ error: 'Service not found or could not be deleted.' });
            }
            return res.status(204).send();
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message }); 
            }
        }

        console.error("Error deleting service:", error);
        return res.status(500).json({ error: 'Ocorreu um erro interno ao deletar o serviço.' });
    }
    
}