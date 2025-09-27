import { CustomError } from '../utils/customErrors';
import { prisma } from './prisma.service';
import { Prisma } from '@prisma/client'; 

export class ClientService {
    // Método para registrar (criar) um novo cliente
    async register(data: { name: string, email: string, phone: string }) {
        return await prisma.client.create({ data });
    }

    // Método para listar todos os clientes
    async listAll() {
        return await prisma.client.findMany();
    }

    // Método para buscar um cliente por ID
    async getById(id: number) {
        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) {
            throw new CustomError('Cliente não encontrado.', 404);
        }
        return client;
    }

    // Método para atualizar um cliente existente
    async update(id: number,dataToUpdate: Prisma.ClientUpdateInput) {
        const clientExists = await prisma.client.findUnique({ where: { id } });
        if (!clientExists) {
            throw new CustomError('Cliente não encontrado para atualização.', 404);
        }
        return await prisma.client.update({
            where: { id },
            data: dataToUpdate,
        });
    }

    // Método para deletar um cliente
    async delete(id: number) {
        // Verifica se o cliente existe antes de tentar deletar
        const clientExists = await prisma.client.findUnique({ where: { id } });

        // Se nao existir, lanca o erro padronizado
        if (!clientExists) {
            throw new CustomError('Cliente não encontrado para exclusão.', 404);
        }

        // Se existir, prossegue com a exclusao
        return await prisma.client.delete({
            where: { id },
        });
    }
} 