// src/services/admin.service.ts
import { prisma } from './prisma.service'; // Importa a instância do Prisma Client
import { Prisma } from '@prisma/client'; // Importa os tipos do Prisma para tipagem segura
import bcrypt from 'bcryptjs'; // Necessário para hash de senha se você permitir update de senha por aqui

export class AdminService {

    // 1. Listar todos os usuários de staff (barbeiro/dono/admin)
    async listAll() {
        // Busca todos os usuários de staff. É crucial NÃO retornar a senha hasheada aqui!
        return await prisma.user.findMany({
            where: { role: { not: 'CLIENTE' } },
            select: { // Seleciona apenas os campos seguros para retornar
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    // 2. Obter usuário de staff por ID
    async findById(id: number) {
        // Busca um usuário único por ID. Também sem a senha.
        return await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    // 3. Atualizar usuário de staff por ID
    // Este método recebe um ID e um objeto com os dados a serem atualizados.
    // **Importante**: Se a senha for atualizada, ela deve ser hasheada AQUI no service.
    async update(id: number, dataToUpdate: Prisma.UserUpdateInput) {
        try {
            // Se houver uma senha nova para atualizar, ela PRECISA ser hasheada aqui
            if (dataToUpdate.password && typeof dataToUpdate.password === 'string') {
                dataToUpdate.password = await bcrypt.hash(dataToUpdate.password, 10);
            }

            const updatedUser = await prisma.user.update({
                where: { id },
                data: dataToUpdate,
                select: { // Retorna o usuário atualizado sem a senha
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            return updatedUser;
        } catch (error: any) {
            // Prisma.PrismaClientKnownRequestError para erros conhecidos do Prisma
            if (error.code === 'P2025') { // Registro não encontrado
                return null; // Retorna null para indicar que não foi encontrado para atualização
            }
            if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
                throw new Error('Email already taken.'); // Email duplicado
            }
            console.error("Error updating admin in service:", error);
            throw error; // Relança outros erros inesperados
        }
    }

    // 4. Deletar usuário de staff por ID
    async delete(id: number) {
        try {
            const deletedUser = await prisma.user.delete({
                where: { id },
                select: { // Opcional: retornar alguns dados do usuário deletado, sem a senha
                    id: true,
                    name: true,
                    email: true,
                }
            });
            return deletedUser;
        } catch (error: any) {
            if (error.code === 'P2025') { // Registro não encontrado para deletar
                return null;
            }
            console.error("Error deleting admin in service:", error);
            throw error;
        }
    }
}
