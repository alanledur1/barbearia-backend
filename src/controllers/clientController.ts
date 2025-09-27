import { Request, Response } from 'express';
import { clientSchema } from "../schemas/clientSchema";
import { ClientService } from "../services/clientService";


export class ClientController {
    async register(req: Request, res: Response) {
        try {
            const data = clientSchema.parse(req.body);
            const clientService = new ClientService();
            const client = await clientService.register(data);
            return res.status(201).json(client);
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    async listAll(req: Request, res: Response) {
        const clientService = new ClientService();
        const clients = await clientService.listAll();
        return res.json(clients);
    }

    async getById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const clientId = parseInt(id, 10)

            if (!clientId) {
                return res.status(400).json({ error: 'Invalid client ID format.' });
            }

            const clientService = new ClientService();
            const client = await clientService.getById(clientId);
            if (!client) {
                return res.status(404).json({ error: 'Client not found' });
            }
            return res.json(client);
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params; // Pega o ID da URL
            const clientId = parseInt(id, 10)

            if (!clientId) {
                return res.status(400).json({ error: 'Invalid client ID format.' });
            }

            const dataToUpdate = clientSchema.partial().parse(req.body);

            const clientService = new ClientService();
            const updatedClient = await clientService.update(clientId, dataToUpdate);

            if (!updatedClient) {
                return res.status(404).json({ error: 'Client not found or could not be updated.' });
            }

            return res.status(200).json(updatedClient); // Retorna o cliente atualizado
        } catch (err: any) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.issues }); // Erros de validação Zod
            }
            return res.status(400).json({ error: err.message });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params; // Pega o ID da URL
            const clientId = parseInt(id, 10)
            
            if (!clientId) {
                return res.status(400).json({ error: 'Invalid client ID format.' });
            }

            const clientService = new ClientService();
            const deletedClient = await clientService.delete(clientId);

            if (!deletedClient) {
                return res.status(404).json({ error: 'Client not found or could not be deleted.' });
            }

            // Resposta padrão para deleção bem-sucedida é 204 No Content
            return res.status(204).send();
            // Alternativamente, você pode retornar uma mensagem de sucesso:
            // return res.status(200).json({ message: 'Client deleted successfully.' });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }
}