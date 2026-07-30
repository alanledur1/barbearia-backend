import { CustomError } from '../utils/customErrors';
import { prisma } from './prisma.service';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { signUserToken } from '../utils/jwt';

export class ClientService {
    // Método para registrar (criar) um novo cliente
    async register(data: { name: string; email: string; phone: string; password: string }) {
        // Garante que a senha foi fornecida
        if (!data.password) {
            throw new CustomError('A senha é obrigatória.', 400);
        }

        // Verifica se o email já está em uso
        if (data.email) {
            const existingUser = await prisma.user.findUnique({
                where: { email: data.email },
            });
            if (existingUser) {
                throw new CustomError('Este email já está em uso.', 409); // 409 Conflict
            }
        }

        // Criptografa a senha antes de salvar
        const hashedPassword = await bcrypt.hash(data.password, 10);

        return await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                password: hashedPassword,
                role: 'CLIENTE',
            },
            // Seleciona os campos para retornar, excluindo a senha
            select: { id: true, name: true, email: true, phone: true, role: true }
        });
    }

    async login(email: string, passwordPlain: string) {
        const client = await prisma.user.findUnique({
            where: { email },
        });

        if (!client || !client.password) {
            throw new CustomError("Email ou senha inválidos.", 401);
        }

        const isPasswordValid = await bcrypt.compare(passwordPlain, client.password);
        if (!isPasswordValid) {
            throw new CustomError("Email ou senha inválidos.", 401);
        }

        const token = signUserToken({ userId: client.id, role: client.role, email: client.email }, "24h");

        return {
            token,
            user: {
                id: client.id,
                name: client.name,
                email: client.email,
                role: client.role,
            },
        };
    }
    // Método para listar todos os clientes
    async listAll() {
        return await prisma.user.findMany({
            select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true, updatedAt: true },
        });
    }

    // Método para buscar um cliente por ID
    async getById(id: number) {
        const client = await prisma.user.findUnique({ where: { id } });
        if (!client) {
            throw new CustomError('Cliente não encontrado.', 404);
        }
        return client;
    }

    // Método para atualizar um cliente existente
    async update(id: number, dataToUpdate: Prisma.UserUpdateInput) {
        const clientExists = await prisma.user.findUnique({ where: { id } });
        if (!clientExists) {
            throw new CustomError('Cliente não encontrado para atualização.', 404);
        }
        return await prisma.user.update({
            where: { id },
            data: dataToUpdate,
        });
    }

    // Método para deletar um cliente
    async delete(id: number) {
        // Verifica se o cliente existe antes de tentar deletar
        const clientExists = await prisma.user.findUnique({ where: { id } });

        // Se nao existir, lanca o erro padronizado
        if (!clientExists) {
            throw new CustomError('Cliente não encontrado para exclusão.', 404);
        }

        // Se existir, prossegue com a exclusao
        return await prisma.user.delete({
            where: { id },
        });
    }
}
