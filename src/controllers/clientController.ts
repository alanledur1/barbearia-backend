import { Request, Response } from 'express';
import { clientSchema } from "../schemas/clientSchema";
import { ClientService } from "../services/clientService";
import { CustomError } from '../utils/customErrors';
import { ZodError } from 'zod';

export class ClientController {

    private clientService: ClientService;

    constructor() {
        this.clientService = new ClientService();
    }

    async register(req: Request, res: Response) {
        try {
            // A validação com Zod pode ser adicionada aqui se você tiver um schema
            const { name, email, phone, password } = req.body;
            if (!name || !email || !phone || !password) {
                return res.status(400).json({ error: "Todos os campos são obrigatórios." });
            }

            const client = await this.clientService.register({ name, email, phone, password });
            return res.status(201).json(client);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            if (err instanceof ZodError) {
                return res.status(400).json({ error: "Dados inválidos.", details: err.issues });
            }
            console.error("Erro ao registrar cliente:", err);
            return res.status(500).json({ error: 'Ocorreu um erro interno.' });
        }
    }

    async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email e senha são obrigatórios.'});
            }

            const result = await this.clientService.login(email, password);
            return res.status(200).json(result);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error("Erro no login do controller:", err);
            return res.status(500).json({ error: "Ocorreu um erro interno no login."});
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
            const clientId = parseInt(id as string, 10)

            if (!clientId) {
                return res.status(400).json({ error: 'Invalid client ID format.' });
            }

            if (req.user?.role === 'CLIENTE' && req.user.id !== clientId) {
                return res.status(403).json({ error: 'Acesso não permitido a este recurso.' });
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
            const clientId = parseInt(id as string, 10)

            if (!clientId) {
                return res.status(400).json({ error: 'Invalid client ID format.' });
            }

            if (req.user?.role === 'CLIENTE' && req.user.id !== clientId) {
                return res.status(403).json({ error: 'Acesso não permitido a este recurso.' });
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
            const clientId = parseInt(id as string, 10)
            
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