import { CustomError } from '../utils/customErrors';
import { prisma } from './prisma.service';
import { Prisma } from '@prisma/client'; 
import bcrypt from 'bcryptjs'; 
import jwt from 'jsonwebtoken'; 

export class ClientService {
    // Método para registrar (criar) um novo cliente
    async register(data: Prisma.ClientCreateInput) {
        // Garante que a senha foi fornecida
        if (!data.password) {
            throw new CustomError('A senha é obrigatória.', 400);
        }

        // Verifica se o email já está em uso
        if (data.email) {
            const existingClient = await prisma.client.findUnique({
                where: { email: data.email },
            });
            if (existingClient) {
                throw new CustomError('Este email já está em uso.', 409); // 409 Conflict
            }
        }

        // Criptografa a senha antes de salvar
        const hashedPassword = await bcrypt.hash(data.password, 10);

        return await prisma.client.create({ 
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                password: hashedPassword,
            },
            // Seleciona os campos para retornar, excluindo a senha
            select: { id: true, name: true, email: true, phone: true }
        });
    }

    async login(email: string, passwordPlain: string) {
        const client = await prisma.client.findUnique({
            where: { email },
        });

        if (!client || !client.password) {
            throw new CustomError("Email ou senha inválidos.", 401);
        }

        const isPasswordValid = await bcrypt.compare(passwordPlain, client.password);
        if (!isPasswordValid) {
            throw new CustomError("Email ou senha inválidos.", 401);
        }

        const jwtSecret = process.env.JWT_SECRET || 'your_super_secret_fallback_key_for_dev';

        const token = jwt.sign(
            { clientId: client.id, name: client.name },
            jwtSecret,
            { expiresIn: "24h" }
        );

        return {
            token,
            client: {
                id: client.id,
                name: client.name,
                email: client.email,
            },
        };
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